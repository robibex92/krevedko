import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  ValidationError,
  UnauthorizedError,
  ConflictError,
  BusinessLogicError,
  NotFoundError,
} from "../core/errors/AppError.js";

/**
 * Service for authentication and authorization logic
 */
export class AuthService {
  constructor(
    userRepository,
    refreshTokenRepository,
    cartRepository,
    favoriteRepository,
    orderRepository,
    mailerService,
    guestCartService
  ) {
    this.userRepo = userRepository;
    this.refreshTokenRepo = refreshTokenRepository;
    this.cartRepo = cartRepository;
    this.favoriteRepo = favoriteRepository;
    this.orderRepo = orderRepository;
    this.mailerService = mailerService;
    this.guestCartService = guestCartService;

    // JWT configuration
    this.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me";
    this.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";
    this.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "24h";
    this.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || "30d";
    this.ROTATE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  /**
   * Register a new user
   */
  async register(data) {
    const { email, password, name, phone, firstName, lastName, referredBy } =
      data;

    if (!email || !password) {
      throw new ValidationError("EMAIL_PASSWORD_REQUIRED");
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if email already exists
    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError("EMAIL_ALREADY_EXISTS");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Prepare user data
    const normalizedFirstName = firstName ? String(firstName).trim() : null;
    const normalizedLastName = lastName ? String(lastName).trim() : null;
    const fallbackName =
      name?.trim() ||
      [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ") ||
      null;

    // Create user
    const user = await this.userRepo.create({
      email: normalizedEmail,
      passwordHash,
      name: fallbackName,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      phone: phone || null,
      referredBy: referredBy || null,
    });

    // Send verification email
    if (normalizedEmail) {
      await this.sendEmailVerification(user.id, normalizedEmail);
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    return {
      user: this.publicUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Login with email and password
   */
  async login(email, password, ipAddress = null) {
    if (!email || !password) {
      throw new ValidationError("EMAIL_PASSWORD_REQUIRED");
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user?.passwordHash) {
      throw new UnauthorizedError("INVALID_CREDENTIALS");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError("INVALID_CREDENTIALS");
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(
      user,
      ipAddress
    );

    return {
      user: this.publicUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshToken) {
    if (!refreshToken) {
      return { ok: true };
    }

    try {
      const payload = this.verifyRefreshToken(refreshToken);
      await this.refreshTokenRepo.revokeByJti(payload.jti);
    } catch (error) {
      // Ignore errors during logout
    }

    return { ok: true };
  }

  /**
   * Migrate guest data to user (cart and orders)
   */
  async migrateGuestDataToUser(sessionId, userId) {
    if (!sessionId || !userId) {
      return { cartMigrated: 0, ordersMigrated: 0 };
    }

    try {
      // Migrate guest cart
      const cartResult = await this.guestCartService.mergeGuestCartIntoUserCart(
        sessionId,
        userId
      );

      // Migrate guest orders
      const ordersResult = await this.orderRepo.migrateGuestOrdersToUser(
        sessionId,
        userId
      );

      return {
        cartMigrated: cartResult?.merged || 0,
        ordersMigrated: ordersResult?.migrated || 0,
      };
    } catch (error) {
      console.error("[AuthService] Error migrating guest data:", error);
      // Не бросаем ошибку - даже если merge не удался, пользователь должен войти
      return { cartMigrated: 0, ordersMigrated: 0 };
    }
  }

  /**
   * Logout from all devices (revoke all refresh tokens)
   */
  async logoutAll(userId) {
    await this.refreshTokenRepo.revokeAllForUser(userId);
    return { ok: true, message: "Logged out from all devices" };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, ipAddress = null) {
    if (!refreshToken) {
      throw new UnauthorizedError("NO_REFRESH");
    }

    const payload = this.verifyRefreshToken(refreshToken);
    const userId = this.resolveUserId(payload?.sub);

    if (userId === null) {
      throw new UnauthorizedError("INVALID_REFRESH");
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError("INVALID_REFRESH");
    }

    // Validate token in database
    const dbToken = await this.refreshTokenRepo.findByJti(payload.jti);
    if (!dbToken || dbToken.revokedAt || dbToken.expiresAt < new Date()) {
      throw new UnauthorizedError("REFRESH_REVOKED_OR_EXPIRED");
    }

    // Check if we need to rotate the refresh token
    const now = Date.now();
    const remainingMs = dbToken.expiresAt.getTime() - now;

    if (remainingMs > this.ROTATE_THRESHOLD_MS) {
      // Keep existing refresh token, only issue new access token
      const accessToken = this.signAccessToken(user);
      return {
        user: this.publicUser(user),
        accessToken,
        refreshToken: null, // Don't rotate
      };
    }

    // Rotate refresh token (close to expiry)
    const newTokenData = this.signRefreshToken(user);

    await this.refreshTokenRepo.prisma.$transaction([
      this.refreshTokenRepo.prisma.refreshToken.update({
        where: { jti: payload.jti },
        data: { revokedAt: new Date(), replacedByJti: newTokenData.jti },
      }),
      this.refreshTokenRepo.prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti: newTokenData.jti,
          expiresAt: newTokenData.expiresAt,
          createdByIp: ipAddress || null,
        },
      }),
    ]);

    const accessToken = this.signAccessToken(user);

    return {
      user: this.publicUser(user),
      accessToken,
      refreshToken: newTokenData.token,
    };
  }

  /**
   * Get current user by access token
   */
  async getCurrentUser(accessToken) {
    if (!accessToken) {
      return null;
    }

    try {
      const payload = jwt.verify(accessToken, this.JWT_ACCESS_SECRET);
      const userId = this.resolveUserId(payload?.sub);

      if (userId === null) {
        return null;
      }

      const user = await this.userRepo.findById(userId);
      return user ? this.publicUser(user) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      throw new ValidationError("EMAIL_REQUIRED");
    }

    const user = await this.userRepo.findByEmail(normalizedEmail);

    // Always return success, even if user doesn't exist (security)
    if (user) {
      const token = this.randomToken(32);
      const tokenHash = this.sha256Hex(token);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.userRepo.setPasswordResetToken(user.id, tokenHash, expiresAt);

      try {
        await this.mailerService.sendPasswordResetEmail(normalizedEmail, token);
      } catch (error) {
        console.error(
          "[AuthService] Failed to send password reset email:",
          error
        );
      }
    }

    return { ok: true };
  }

  /**
   * Reset password with token
   */
  async resetPassword(email, token, newPassword) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const providedToken = String(token || "").trim();
    const password = String(newPassword || "").trim();

    if (!normalizedEmail || !providedToken || !password) {
      throw new ValidationError("INVALID_PARAMS");
    }

    if (password.length < 6) {
      throw new ValidationError("PASSWORD_TOO_SHORT");
    }

    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (
      !user ||
      !user.passwordResetTokenHash ||
      !user.passwordResetExpiresAt ||
      user.passwordResetTokenHash !== this.sha256Hex(providedToken)
    ) {
      throw new ValidationError("INVALID_TOKEN");
    }

    if (user.passwordResetExpiresAt < new Date()) {
      throw new ValidationError("TOKEN_EXPIRED");
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await this.userRepo.updatePassword(user.id, passwordHash);

    // Revoke all existing refresh tokens for security
    await this.refreshTokenRepo.revokeAllForUser(user.id);

    // Generate new tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    return {
      user: this.publicUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(email, token) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const providedToken = String(token || "").trim();

    if (!normalizedEmail || !providedToken) {
      throw new ValidationError("INVALID_PARAMS");
    }

    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (
      !user ||
      !user.emailVerificationTokenHash ||
      !user.emailVerificationExpiresAt
    ) {
      throw new ValidationError("INVALID_TOKEN");
    }

    if (user.emailVerifiedAt) {
      return { ok: true, alreadyVerified: true };
    }

    if (user.emailVerificationExpiresAt < new Date()) {
      throw new ValidationError("TOKEN_EXPIRED");
    }

    if (user.emailVerificationTokenHash !== this.sha256Hex(providedToken)) {
      throw new ValidationError("INVALID_TOKEN");
    }

    await this.userRepo.verifyEmail(user.id);

    return { ok: true };
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(userId) {
    const user = await this.userRepo.findByIdOrFail(userId);

    if (!user.email) {
      throw new ValidationError("NO_EMAIL");
    }

    if (user.emailVerifiedAt) {
      return { ok: true, alreadyVerified: true };
    }

    await this.sendEmailVerification(user.id, user.email);

    return { ok: true };
  }

  /**
   * Update user email
   */
  async updateEmail(userId, newEmail) {
    const normalizedEmail = String(newEmail || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      throw new ValidationError("EMAIL_REQUIRED");
    }

    // Check if email is already taken by another user
    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing && existing.id !== userId) {
      throw new ConflictError("EMAIL_ALREADY_EXISTS");
    }

    // Update email and reset verification
    await this.userRepo.updateEmail(userId, normalizedEmail);

    // Send verification email
    await this.sendEmailVerification(userId, normalizedEmail);

    return { ok: true };
  }

  /**
   * Telegram login/registration
   */
  async telegramVerify(authData, ipAddress = null) {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_USERNAME) {
      throw new BusinessLogicError("TELEGRAM_NOT_CONFIGURED");
    }

    // Verify telegram signature
    const valid = this.verifyTelegramLogin(authData, TELEGRAM_BOT_TOKEN);
    if (!valid) {
      throw new UnauthorizedError("INVALID_TELEGRAM_SIGNATURE");
    }

    const telegramId = String(authData.id);
    const name =
      [authData.first_name, authData.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
    const telegramUsername = authData.username || null;
    const telegramPhotoUrl = authData.photo_url || null;
    const firstName = authData.first_name || null;
    const lastName = authData.last_name || null;

    // Find existing user or create new
    let user = await this.userRepo.findByTelegramId(telegramId);

    if (!user) {
      user = await this.userRepo.create({
        name,
        firstName,
        lastName,
        telegramId,
        telegramUsername,
        telegramPhotoUrl,
        avatarPath: null,
        referralCode: this.generateReferralCode(),
      });
    } else {
      // Update telegram data if user exists
      const updateData = { telegramUsername, telegramPhotoUrl };
      if (!user.name && name) updateData.name = name;
      if (!user.firstName && firstName) updateData.firstName = firstName;
      if (!user.lastName && lastName) updateData.lastName = lastName;

      user = await this.userRepo.update(user.id, updateData);
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(
      user,
      ipAddress
    );

    return {
      user: this.publicUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Link telegram to existing account
   */
  async telegramLink(userId, authData) {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = process.env;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_USERNAME) {
      throw new BusinessLogicError("TELEGRAM_NOT_CONFIGURED");
    }

    // Verify telegram signature
    const valid = this.verifyTelegramLogin(authData, TELEGRAM_BOT_TOKEN);
    if (!valid) {
      throw new UnauthorizedError("INVALID_TELEGRAM_SIGNATURE");
    }

    const telegramId = String(authData.id);
    const name =
      [authData.first_name, authData.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
    const telegramUsername = authData.username || null;
    const telegramPhotoUrl = authData.photo_url || null;
    const firstName = authData.first_name || null;
    const lastName = authData.last_name || null;

    // Check if another user has this telegram ID
    const existing = await this.userRepo.findByTelegramId(telegramId);

    if (existing && existing.id !== userId) {
      // Merge accounts
      const merged = await this.mergeAccounts(userId, existing.id, {
        telegramId,
        telegramUsername,
        telegramPhotoUrl,
        name,
        firstName,
        lastName,
      });

      return {
        user: this.publicUser(merged),
        merged: true,
      };
    }

    // Check for orphan telegram account
    const orphan = await this.userRepo.findOrphanTelegramAccount(
      telegramId,
      userId
    );

    if (orphan) {
      const merged = await this.mergeAccounts(userId, orphan.id, {
        telegramId,
        telegramUsername,
        telegramPhotoUrl,
        name,
        firstName,
        lastName,
      });

      return {
        user: this.publicUser(merged),
        merged: true,
      };
    }

    // Normal link - no merge needed
    const currentUser = await this.userRepo.findByIdOrFail(userId);
    const updateData = { telegramId, telegramUsername, telegramPhotoUrl };
    if (!currentUser.name && name) updateData.name = name;
    if (!currentUser.firstName && firstName) updateData.firstName = firstName;
    if (!currentUser.lastName && lastName) updateData.lastName = lastName;

    const user = await this.userRepo.update(userId, updateData);

    return {
      user: this.publicUser(user),
      merged: false,
    };
  }

  /**
   * Unlink telegram from account
   */
  async telegramUnlink(userId) {
    // Check if user has alternative auth method
    const hasAlternative = await this.userRepo.hasAlternativeAuthMethod(userId);

    if (!hasAlternative) {
      throw new BusinessLogicError("CANNOT_UNLINK_ONLY_AUTH_METHOD");
    }

    const user = await this.userRepo.unlinkTelegram(userId);

    return {
      user: this.publicUser(user),
    };
  }

  /**
   * Merge two user accounts
   * @private
   */
  async mergeAccounts(targetUserId, sourceUserId, telegramData) {
    return await this.userRepo.prisma.$transaction(async (tx) => {
      const [targetUser, sourceUser] = await Promise.all([
        tx.user.findUnique({ where: { id: targetUserId } }),
        tx.user.findUnique({ where: { id: sourceUserId } }),
      ]);

      if (!sourceUser) {
        throw new NotFoundError("SOURCE_ACCOUNT_NOT_FOUND");
      }

      // 1) Move orders
      await tx.order.updateMany({
        where: { userId: sourceUserId },
        data: { userId: targetUserId },
      });

      // 2) Move cart items with upsert to avoid conflicts
      const sourceCart = await tx.cartItem.findMany({
        where: { userId: sourceUserId },
      });
      for (const item of sourceCart) {
        await tx.cartItem.upsert({
          where: {
            userId_collectionId_productId: {
              userId: targetUserId,
              collectionId: item.collectionId,
              productId: item.productId,
            },
          },
          update: {
            quantityDecimal: item.quantityDecimal.toString(),
            unitPriceKopecks: item.unitPriceKopecks,
          },
          create: {
            userId: targetUserId,
            collectionId: item.collectionId,
            productId: item.productId,
            quantityDecimal: item.quantityDecimal.toString(),
            unitPriceKopecks: item.unitPriceKopecks,
          },
        });
      }
      await tx.cartItem.deleteMany({ where: { userId: sourceUserId } });

      // 3) Move favorites with upsert
      const sourceFavorites = await tx.favorite.findMany({
        where: { userId: sourceUserId },
      });
      for (const fav of sourceFavorites) {
        await tx.favorite.upsert({
          where: {
            userId_productId: {
              userId: targetUserId,
              productId: fav.productId,
            },
          },
          update: {},
          create: { userId: targetUserId, productId: fav.productId },
        });
      }
      await tx.favorite.deleteMany({ where: { userId: sourceUserId } });

      // 4) Reassign referrals
      await tx.user.updateMany({
        where: { referredBy: sourceUserId },
        data: { referredBy: targetUserId },
      });

      // 5) Merge loyalty points
      const mergedPoints =
        (targetUser?.loyaltyPoints || 0) + (sourceUser?.loyaltyPoints || 0);

      // 6) Release telegram fields on source account
      await tx.user.update({
        where: { id: sourceUserId },
        data: {
          telegramId: null,
          telegramUsername: null,
          telegramPhotoUrl: null,
        },
      });

      // 7) Update target user with telegram info and merged data
      const updateData = {
        telegramId: telegramData.telegramId,
        telegramUsername: telegramData.telegramUsername,
        telegramPhotoUrl: telegramData.telegramPhotoUrl,
        loyaltyPoints: mergedPoints,
      };

      // Prefer existing fields from target, but take from source if target is empty
      const preferField = (field) => {
        if (!targetUser?.[field] && sourceUser?.[field]) {
          updateData[field] = sourceUser[field];
        }
      };

      if (!targetUser?.name && telegramData.name) {
        updateData.name = telegramData.name;
      }
      if (!targetUser?.firstName && telegramData.firstName) {
        updateData.firstName = telegramData.firstName;
      }
      if (!targetUser?.lastName && telegramData.lastName) {
        updateData.lastName = telegramData.lastName;
      }

      preferField("name");
      preferField("firstName");
      preferField("lastName");
      preferField("phone");
      preferField("addressStreet");
      preferField("addressHouse");
      preferField("addressApartment");
      preferField("avatarPath");
      preferField("email");
      preferField("emailVerifiedAt");

      const mergedUser = await tx.user.update({
        where: { id: targetUserId },
        data: updateData,
      });

      // 8) Revoke refresh tokens of source user and delete account
      await tx.refreshToken.updateMany({
        where: { userId: sourceUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.delete({ where: { id: sourceUserId } });

      return mergedUser;
    });
  }

  /**
   * Generate JWT tokens for user
   * @private
   */
  async generateTokens(user, ipAddress = null) {
    const accessToken = this.signAccessToken(user);
    const refreshData = this.signRefreshToken(user);

    // Persist refresh token
    try {
      await this.refreshTokenRepo.createToken({
        userId: user.id,
        jti: refreshData.jti,
        expiresAt: refreshData.expiresAt,
        createdByIp: ipAddress,
      });
    } catch (error) {
      console.error("[AuthService] Failed to persist refresh token:", error);
    }

    return {
      accessToken,
      refreshToken: refreshData.token,
    };
  }

  /**
   * Sign access token
   * @private
   */
  signAccessToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      this.JWT_ACCESS_SECRET,
      { expiresIn: this.JWT_ACCESS_TTL }
    );
  }

  /**
   * Sign refresh token
   * @private
   */
  signRefreshToken(user) {
    const jti = crypto.randomBytes(16).toString("hex");
    const token = jwt.sign(
      {
        sub: user.id,
        jti,
      },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.JWT_REFRESH_TTL }
    );

    const decoded = jwt.decode(token);
    const expiresAt = decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return { token, jti, expiresAt };
  }

  /**
   * Verify refresh token
   * @private
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new UnauthorizedError("INVALID_REFRESH_TOKEN");
    }
  }

  /**
   * Send email verification
   * @private
   */
  async sendEmailVerification(userId, email) {
    const token = this.randomToken(32);
    const tokenHash = this.sha256Hex(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.userRepo.setEmailVerificationToken(userId, tokenHash, expiresAt);

    try {
      await this.mailerService.sendVerificationEmail(email, token);
    } catch (error) {
      console.error("[AuthService] Failed to send verification email:", error);
    }
  }

  /**
   * Generate referral code for new users
   * @private
   */
  generateReferralCode() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `REF${timestamp}${randomPart}`;
  }

  /**
   * Verify Telegram login signature
   * @private
   */
  verifyTelegramLogin(authData, botToken) {
    const { hash, ...data } = authData;
    if (!hash) return false;

    const checkString = Object.keys(data)
      .sort()
      .map((k) => `${k}=${data[k]}`)
      .join("\n");

    const secretKey = crypto.createHash("sha256").update(botToken).digest();
    const hmac = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    return hmac === hash;
  }

  /**
   * Generate random token
   * @private
   */
  randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
  }

  /**
   * SHA256 hash
   * @private
   */
  sha256Hex(str) {
    return crypto.createHash("sha256").update(str).digest("hex");
  }

  /**
   * Resolve user ID from JWT payload
   * @private
   */
  resolveUserId(sub) {
    if (typeof sub === "number" && Number.isInteger(sub) && sub > 0) {
      return sub;
    }
    return null;
  }

  /**
   * Get public user data (remove sensitive fields)
   * @private
   */
  publicUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email ?? null,
      name: u.name ?? null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      phone: u.phone ?? null,
      role: u.role,
      avatarPath: u.avatarPath ?? null,
      addressStreet: u.addressStreet ?? null,
      addressHouse: u.addressHouse ?? null,
      addressApartment: u.addressApartment ?? null,
      telegramId: u.telegramId ?? null,
      telegramUsername: u.telegramUsername ?? null,
      telegramPhotoUrl: u.telegramPhotoUrl ?? null,
      emailVerifiedAt: u.emailVerifiedAt ?? null,
      loyaltyPoints: u.loyaltyPoints ?? 0,
      referralCode: u.referralCode ?? null,
      createdAt: u.createdAt,
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(email, token) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (!user) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

    if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
      throw new ValidationError("Invalid token", "INVALID_TOKEN");
    }

    // Check if token matches
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (user.emailVerificationTokenHash !== tokenHash) {
      throw new ValidationError("Invalid token", "INVALID_TOKEN");
    }

    // Check if token expired
    if (user.emailVerificationExpiresAt < new Date()) {
      throw new ValidationError("Token expired", "TOKEN_EXPIRED");
    }

    // Verify email (only if not already verified)
    if (!user.emailVerifiedAt) {
      await this.userRepo.update(user.id, {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      });
    }

    return { ok: true };
  }
}
