import { Strategy as GoogleStrategy } from "passport-google-oauth20";

/**
 * Настройка Google OAuth стратегии для Passport.js
 */
export function configureGoogleStrategy(passport, oauthService) {
  // Пропускаем если нет credentials
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      "⚠️  Google OAuth не настроен (пропущены GOOGLE_CLIENT_ID/SECRET)"
    );
    return;
  }

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        passReqToCallback: true, // Передаем req в callback
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Получаем sessionId из query или cookie
          const sessionId = req.query.state || req.cookies?.guestSessionId;

          // Нормализуем профиль
          const normalizedProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value,
            displayName: profile.displayName,
            name: {
              givenName: profile.name?.givenName,
              familyName: profile.name?.familyName,
            },
            photos: profile.photos,
            accessToken,
            refreshToken,
            expiresAt: null, // Google не возвращает expiry
            _json: profile._json,
          };

          // Найти или создать пользователя
          const user = await oauthService.findOrCreateUserFromOAuth(
            "google",
            normalizedProfile,
            sessionId
          );

          done(null, user);
        } catch (error) {
          console.error("[GoogleStrategy] Error:", error);
          done(error, null);
        }
      }
    )
  );
}
