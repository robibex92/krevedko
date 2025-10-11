import { Router } from "express";
import passport from "passport";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

/**
 * OAuth routes (Google, Yandex, Mail.ru)
 */
export function createOAuthRoutes(container) {
  const router = Router();
  const oauthController = container.resolve("oauthController");

  // ===== Google OAuth =====

  /**
   * Инициировать OAuth flow для Google
   * GET /api/auth/oauth/google
   */
  router.get("/auth/oauth/google", (req, res, next) => {
    // Сохраняем sessionId в state для передачи в callback
    const sessionId = req.cookies?.guestSessionId || req.query.sessionId;
    const state = sessionId || "";

    passport.authenticate("google", {
      scope: ["profile", "email"],
      state, // Передаем sessionId через state
    })(req, res, next);
  });

  /**
   * Callback после Google OAuth
   * GET /api/auth/oauth/google/callback
   */
  router.get(
    "/auth/oauth/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/#/login?error=google_failed`,
    }),
    asyncHandler(oauthController.handleOAuthCallback)
  );

  // ===== Yandex OAuth =====

  /**
   * Инициировать OAuth flow для Yandex
   * GET /api/auth/oauth/yandex
   */
  router.get("/auth/oauth/yandex", (req, res, next) => {
    const sessionId = req.cookies?.guestSessionId || req.query.sessionId;
    const state = sessionId || "";

    passport.authenticate("yandex", {
      state,
    })(req, res, next);
  });

  /**
   * Callback после Yandex OAuth
   * GET /api/auth/oauth/yandex/callback
   */
  router.get(
    "/auth/oauth/yandex/callback",
    passport.authenticate("yandex", {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/#/login?error=yandex_failed`,
    }),
    asyncHandler(oauthController.handleOAuthCallback)
  );

  // ===== Mail.ru OAuth =====

  /**
   * Инициировать OAuth flow для Mail.ru
   * GET /api/auth/oauth/mailru
   */
  router.get("/auth/oauth/mailru", (req, res, next) => {
    const sessionId = req.cookies?.guestSessionId || req.query.sessionId;
    const state = sessionId || "";

    passport.authenticate("mailru", {
      state,
    })(req, res, next);
  });

  /**
   * Callback после Mail.ru OAuth
   * GET /api/auth/oauth/mailru/callback
   */
  router.get(
    "/auth/oauth/mailru/callback",
    passport.authenticate("mailru", {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/#/login?error=mailru_failed`,
    }),
    asyncHandler(oauthController.handleOAuthCallback)
  );

  // ===== Управление OAuth аккаунтами (для авторизованных пользователей) =====

  /**
   * Отвязать OAuth аккаунт
   * DELETE /api/auth/oauth/:provider/unlink
   */
  router.delete(
    "/auth/oauth/:provider/unlink",
    requireAuth,
    asyncHandler(oauthController.unlinkOAuthAccount)
  );

  /**
   * Получить список привязанных OAuth аккаунтов
   * GET /api/auth/oauth/accounts
   */
  router.get(
    "/auth/oauth/accounts",
    requireAuth,
    asyncHandler(oauthController.getOAuthAccounts)
  );

  return router;
}
