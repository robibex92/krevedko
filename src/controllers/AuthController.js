import { BaseController } from "../core/base/BaseController.js";
import {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateUpdateEmail,
} from "../validators/authValidators.js";
import { toUserAuthDTO } from "../dto/UserDTO.js";

/**
 * Controller for authentication endpoints
 */
export class AuthController extends BaseController {
  constructor(authService) {
    super();
    this.authService = authService;
  }

  /**
   * POST /api/auth/register
   * Register a new user
   */
  register = async (req, res) => {
    // Validation
    const validatedData = validateRegister(req.body || {});

    // Get referral from cookie instead of session
    const referredBy = req.cookies?.referralCode || null;

    const result = await this.authService.register({
      ...validatedData,
      referredBy,
    });

    // Clear referral cookie
    if (req.cookies?.referralCode) {
      res.clearCookie("referralCode");
    }

    // Set refresh token cookie
    this.setRefreshCookie(res, result.refreshToken);

    // Применяем DTO для авторизации (только нужные поля)
    const userDTO = toUserAuthDTO(result.user);

    this.created(res, {
      user: userDTO,
      accessToken: result.accessToken,
    });
  };

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  login = async (req, res) => {
    // Validation
    const { email, password } = validateLogin(req.body || {});

    const result = await this.authService.login(email, password, req.ip);

    // Set refresh token cookie
    this.setRefreshCookie(res, result.refreshToken);

    this.success(res, {
      user: result.user,
      accessToken: result.accessToken,
    });
  };

  /**
   * POST /api/auth/logout
   * Logout current session
   */
  logout = async (req, res) => {
    const refreshToken = req.cookies?.refresh_token;

    await this.authService.logout(refreshToken);

    // Clear cookies
    this.clearRefreshCookie(res);

    this.success(res, { ok: true });
  };

  /**
   * POST /api/auth/logout-all
   * Logout from all devices
   */
  logoutAll = async (req, res) => {
    const userId = this.getUserId(req);

    const result = await this.authService.logoutAll(userId);

    // Clear cookies
    this.clearRefreshCookie(res);

    this.success(res, result);
  };

  /**
   * GET /api/auth/me
   * Get current user
   */
  me = async (req, res) => {
    // Disable caching
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    // Check JWT
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];

    if (!authHeader || !String(authHeader).startsWith("Bearer ")) {
      return this.success(res, { user: null });
    }

    const token = String(authHeader).slice(7);
    const user = await this.authService.getCurrentUser(token);

    this.success(res, { user });
  };

  /**
   * POST /api/auth/refresh
   * Refresh access token
   */
  refresh = async (req, res) => {
    const refreshToken = req.cookies?.refresh_token;

    const result = await this.authService.refreshAccessToken(
      refreshToken,
      req.ip
    );

    // If refresh token was rotated, set new cookie
    if (result.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken);
    }

    this.success(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  };

  /**
   * POST /api/auth/password/forgot
   * Request password reset
   */
  forgotPassword = async (req, res) => {
    // Validation
    const { email } = validateForgotPassword(req.body || {});

    const result = await this.authService.requestPasswordReset(email);

    this.success(res, result);
  };

  /**
   * POST /api/auth/password/reset
   * Reset password with token
   */
  resetPassword = async (req, res) => {
    // Validation
    const { email, token, password } = validateResetPassword(req.body || {});

    const result = await this.authService.resetPassword(email, token, password);

    // Set refresh token cookie
    this.setRefreshCookie(res, result.refreshToken);

    this.success(res, {
      user: result.user,
      accessToken: result.accessToken,
    });
  };

  /**
   * GET /api/auth/verify
   * Verify email with token
   */
  verifyEmail = async (req, res) => {
    const { email, token } = req.query || {};

    validateRequired({ email, token });

    const result = await this.authService.verifyEmail(email, token);

    this.success(res, result);
  };

  /**
   * POST /api/auth/verify/resend
   * Resend email verification
   */
  resendVerification = async (req, res) => {
    const userId = this.getUserId(req);

    const result = await this.authService.resendEmailVerification(userId);

    this.success(res, result);
  };

  /**
   * POST /api/auth/email
   * Update user email
   */
  updateEmail = async (req, res) => {
    const userId = this.getUserId(req);

    // Validation
    const { email } = validateUpdateEmail(req.body || {});

    const result = await this.authService.updateEmail(userId, email);

    this.success(res, result);
  };

  /**
   * POST /api/auth/telegram/verify
   * Login/register with Telegram
   */
  telegramVerify = async (req, res) => {
    const authData = req.body || {};

    const result = await this.authService.telegramVerify(authData, req.ip);

    // Set refresh token cookie
    this.setRefreshCookie(res, result.refreshToken);

    this.success(res, {
      user: result.user,
      accessToken: result.accessToken,
    });
  };

  /**
   * POST /api/auth/telegram/link
   * Link Telegram to existing account
   */
  telegramLink = async (req, res) => {
    const userId = this.getUserId(req);
    const authData = req.body || {};

    const result = await this.authService.telegramLink(userId, authData);

    this.success(res, result);
  };

  /**
   * POST /api/auth/telegram/unlink
   * Unlink Telegram from account
   */
  telegramUnlink = async (req, res) => {
    const userId = this.getUserId(req);

    const result = await this.authService.telegramUnlink(userId);

    this.success(res, result);
  };

  /**
   * Set refresh token cookie
   * @private
   */
  setRefreshCookie(res, token) {
    const COOKIE_BASE_PATH = (process.env.COOKIE_BASE_PATH || "").replace(
      /\/$/,
      ""
    );
    const REFRESH_COOKIE_PATH = `${COOKIE_BASE_PATH}/api/auth` || "/api/auth";
    const NODE_ENV = process.env.NODE_ENV || "development";

    res.cookie("refresh_token", token, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  /**
   * Clear refresh token cookie
   * @private
   */
  clearRefreshCookie(res) {
    const COOKIE_BASE_PATH = (process.env.COOKIE_BASE_PATH || "").replace(
      /\/$/,
      ""
    );
    const REFRESH_COOKIE_PATH = `${COOKIE_BASE_PATH}/api/auth` || "/api/auth";

    res.clearCookie("refresh_token", {
      httpOnly: true,
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
    });
  }

  /**
   * GET /api/verify-email
   * Verify email with token (returns HTML page)
   */
  verifyEmail = async (req, res) => {
    const token = String(req.query.token || "").trim();
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();

    if (!token || !email) {
      return res
        .status(400)
        .send(this._errorPage("❌ Ссылка недействительна или устарела."));
    }

    try {
      await this.authService.verifyEmail(email, token);

      const origin = (process.env.FRONTEND_ORIGIN || "/").trim() || "/";
      return res.send(this._successPage(origin, 5));
    } catch (error) {
      let message = "⚠️ Ошибка на сервере. Попробуйте позже.";

      if (error.code === "INVALID_TOKEN" || error.code === "USER_NOT_FOUND") {
        message = "❌ Ссылка недействительна или устарела.";
      } else if (error.code === "TOKEN_EXPIRED") {
        message = "⌛️ Срок действия ссылки истёк. Попросите новую.";
      }

      return res.status(error.statusCode || 500).send(this._errorPage(message));
    }
  };

  _htmlEscape(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _successPage(redirectUrl, seconds) {
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Email подтверждён</title><style>body{margin:0;font-family:"Segoe UI",Roboto,sans-serif;background:#f6f8fb;color:#1b1b1f;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(20,33,61,0.12);padding:48px 40px;max-width:420px;width:100%;text-align:center}.icon{font-size:48px;margin-bottom:16px}h1{margin:0 0 12px;font-size:24px}p{margin:8px 0;line-height:1.6}a.button{display:inline-block;margin-top:24px;padding:12px 24px;background:#2f80ed;color:#fff;text-decoration:none;border-radius:10px;font-weight:600}a.button:hover{background:#2c6ad6}.countdown{font-variant-numeric:tabular-nums;font-weight:600}</style><script>const redirectUrl=${JSON.stringify(
      redirectUrl
    )};const redirectDelay=${
      Number(seconds) || 5
    };let remaining=redirectDelay;function tick(){const el=document.getElementById("seconds");if(el){el.textContent=remaining}if(remaining<=0){window.location.assign(redirectUrl);return}remaining-=1;setTimeout(tick,1000)}document.addEventListener("DOMContentLoaded",()=>{tick()})</script></head><body><div class="card"><div class="icon">✅</div><h1>Email подтверждён</h1><p>Вы молодец 😎 Сейчас вернём вас на сайт.</p><p>Перенос через <span class="countdown" id="seconds">${seconds}</span> сек.</p><p>Если не хотите ждать — нажмите на кнопку ниже.</p><a class="button" href="${this._htmlEscape(
      redirectUrl
    )}">Вернуться на сайт</a></div></body></html>`;
  }

  _errorPage(message) {
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Ссылка недействительна</title><style>body{margin:0;font-family:"Segoe UI",Roboto,sans-serif;background:#1f2933;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.card{max-width:420px}h1{font-size:26px;margin-bottom:16px}p{margin:0;font-size:18px;line-height:1.6}</style></head><body><div class="card"><h1>🥲 Ой!</h1><p>${this._htmlEscape(
      message
    )}</p></div></body></html>`;
  }
}
