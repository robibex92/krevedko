import {
  NotFoundError,
  ConflictError,
  BusinessLogicError,
} from "../core/errors/AppError.js";

/**
 * Service для OAuth аутентификации (Google, Yandex, Mail.ru)
 */
export class OAuthService {
  constructor(oauthRepository, userRepository, guestCartService, orderService) {
    this.oauthRepo = oauthRepository;
    this.userRepo = userRepository;
    this.guestCartService = guestCartService;
    this.orderService = orderService;
  }

  /**
   * Найти или создать пользователя по OAuth профилю
   * Используется при первом входе через OAuth
   */
  async findOrCreateUserFromOAuth(provider, profile, sessionId = null) {
    const providerId = profile.id;
    const email = profile.emails?.[0]?.value || profile.email;

    // 1. Проверяем, существует ли OAuth аккаунт
    let oauthAccount = await this.oauthRepo.findByProviderAndProviderId(
      provider,
      providerId
    );

    if (oauthAccount) {
      // OAuth аккаунт найден - обновляем токены и возвращаем пользователя
      await this.oauthRepo.updateOAuthAccount(oauthAccount.id, {
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
        email,
        displayName: profile.displayName,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatarUrl: profile.photos?.[0]?.value,
        metadata: profile._json,
      });

      // Если есть sessionId - мержим корзину и заказы
      if (sessionId) {
        await this.mergeGuestDataToUser(sessionId, oauthAccount.userId);
      }

      return oauthAccount.user;
    }

    // 2. OAuth аккаунт не найден - проверяем по email
    let user = null;
    if (email) {
      user = await this.userRepo.findByEmail(email);
    }

    if (user) {
      // Пользователь с таким email существует - привязываем OAuth
      oauthAccount = await this.oauthRepo.createOAuthAccount({
        userId: user.id,
        provider,
        providerId,
        email,
        displayName: profile.displayName,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatarUrl: profile.photos?.[0]?.value,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
        metadata: profile._json,
      });

      // Обновляем соответствующее поле в User
      const providerField = `${provider}Id`;
      await this.userRepo.update(user.id, {
        [providerField]: providerId,
      });

      // Если есть sessionId - мержим корзину и заказы
      if (sessionId) {
        await this.mergeGuestDataToUser(sessionId, user.id);
      }

      return user;
    }

    // 3. Новый пользователь - создаем
    const firstName =
      profile.name?.givenName || profile.displayName || "Пользователь";
    const lastName = profile.name?.familyName || "";

    user = await this.userRepo.create({
      email,
      emailVerifiedAt: email ? new Date() : null, // OAuth email - уже верифицирован
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      role: "CUSTOMER",
      referralCode: this.generateReferralCode(),
      avatarPath: profile.photos?.[0]?.value, // Можем сохранить URL аватара
      [`${provider}Id`]: providerId,
    });

    // Создаем OAuth аккаунт
    await this.oauthRepo.createOAuthAccount({
      userId: user.id,
      provider,
      providerId,
      email,
      displayName: profile.displayName,
      firstName,
      lastName,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      expiresAt: profile.expiresAt,
      metadata: profile._json,
    });

    // Если есть sessionId - мержим корзину и заказы
    if (sessionId) {
      await this.mergeGuestDataToUser(sessionId, user.id);
    }

    return user;
  }

  /**
   * Привязать OAuth аккаунт к существующему пользователю
   * Используется когда авторизованный пользователь хочет привязать Google/Yandex/Mail.ru
   */
  async linkOAuthAccount(userId, provider, profile) {
    const providerId = profile.id;
    const email = profile.emails?.[0]?.value || profile.email;

    // Проверяем, не привязан ли уже этот OAuth аккаунт к другому пользователю
    const existingOAuth = await this.oauthRepo.findByProviderAndProviderId(
      provider,
      providerId
    );

    if (existingOAuth) {
      if (existingOAuth.userId !== userId) {
        throw new ConflictError(
          `Этот ${provider} аккаунт уже привязан к другому пользователю`
        );
      }
      // Уже привязан к этому же пользователю - просто обновляем токены
      await this.oauthRepo.updateOAuthAccount(existingOAuth.id, {
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
        email,
        displayName: profile.displayName,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatarUrl: profile.photos?.[0]?.value,
        metadata: profile._json,
      });
      return existingOAuth;
    }

    // Создаем новую связь
    const oauthAccount = await this.oauthRepo.createOAuthAccount({
      userId,
      provider,
      providerId,
      email,
      displayName: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      expiresAt: profile.expiresAt,
      metadata: profile._json,
    });

    // Обновляем поле в User
    const providerField = `${provider}Id`;
    await this.userRepo.update(userId, {
      [providerField]: providerId,
    });

    return oauthAccount;
  }

  /**
   * Отвязать OAuth аккаунт от пользователя
   */
  async unlinkOAuthAccount(userId, provider) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Проверяем, есть ли у пользователя другие способы входа
    const hasPassword = !!user.passwordHash;
    const oauthAccounts = await this.oauthRepo.findByUserId(userId);
    const otherOAuthAccounts = oauthAccounts.filter(
      (acc) => acc.provider !== provider
    );

    if (!hasPassword && otherOAuthAccounts.length === 0) {
      throw new BusinessLogicError(
        "Нельзя отвязать последний способ входа. Сначала установите пароль или привяжите другой аккаунт."
      );
    }

    // Удаляем OAuth аккаунт
    await this.oauthRepo.deleteOAuthAccount(userId, provider);

    // Очищаем поле в User
    const providerField = `${provider}Id`;
    await this.userRepo.update(userId, {
      [providerField]: null,
    });

    return { success: true };
  }

  /**
   * Получить список привязанных OAuth аккаунтов пользователя
   */
  async getUserOAuthAccounts(userId) {
    return this.oauthRepo.findByUserId(userId);
  }

  /**
   * Объединить данные guest пользователя (корзина, заказы) с авторизованным
   */
  async mergeGuestDataToUser(sessionId, userId) {
    if (!sessionId) return;

    try {
      // Мержим корзину
      await this.guestCartService.mergeGuestCartIntoUserCart(sessionId, userId);

      // Мержим заказы
      await this.orderService.migrateGuestOrdersToUser(sessionId, userId);
    } catch (error) {
      console.error("[OAuthService] Error merging guest data:", error);
      // Не бросаем ошибку - даже если merge не удался, пользователь должен войти
    }
  }

  /**
   * Generate referral code (without userId for new users)
   * @private
   */
  generateReferralCode() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `REF${timestamp}${randomPart}`;
  }
}
