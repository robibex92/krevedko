import { BaseController } from "../core/base/BaseController.js";
import jwt from "jsonwebtoken";

/**
 * Controller для OAuth аутентификации
 */
export class OAuthController extends BaseController {
  constructor(oauthService) {
    super();
    this.oauthService = oauthService;
  }

  /**
   * Callback после успешной OAuth аутентификации
   * Генерирует JWT токены и делает redirect на frontend
   */
  handleOAuthCallback = async (req, res) => {
    try {
      const user = req.user; // Заполнен Passport.js

      if (!user) {
        // Redirect на frontend с ошибкой
        return res.redirect(
          `${process.env.FRONTEND_URL}/#/login?error=auth_failed`
        );
      }

      // Генерируем access и refresh токены
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
      );

      // Сохраняем refresh token в БД (если есть RefreshTokenRepository)
      // await this.refreshTokenRepo.create({ userId: user.id, token: refreshToken });

      // Redirect на frontend с токенами
      const redirectUrl = `${process.env.FRONTEND_URL}/#/auth-callback?accessToken=${accessToken}&refreshToken=${refreshToken}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("[OAuthController] handleOAuthCallback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/#/login?error=server_error`);
    }
  };

  /**
   * Привязать OAuth аккаунт к существующему пользователю
   * Используется когда авторизованный пользователь хочет привязать Google/Yandex/Mail.ru
   */
  linkOAuthAccount = async (req, res) => {
    const userId = this.getUserId(req);
    const { provider } = req.params;
    const profile = req.user; // Заполнен Passport.js

    const oauthAccount = await this.oauthService.linkOAuthAccount(
      userId,
      provider,
      profile
    );

    this.success(res, { oauthAccount }, `${provider} аккаунт успешно привязан`);
  };

  /**
   * Отвязать OAuth аккаунт
   */
  unlinkOAuthAccount = async (req, res) => {
    const userId = this.getUserId(req);
    const { provider } = req.params;

    await this.oauthService.unlinkOAuthAccount(userId, provider);

    this.success(res, null, `${provider} аккаунт отвязан`);
  };

  /**
   * Получить список привязанных OAuth аккаунтов
   */
  getOAuthAccounts = async (req, res) => {
    const userId = this.getUserId(req);

    const accounts = await this.oauthService.getUserOAuthAccounts(userId);

    this.success(res, { accounts });
  };
}
