import { Strategy as MailRuStrategy } from "passport-mailru";

/**
 * Настройка Mail.ru OAuth стратегии для Passport.js
 */
export function configureMailRuStrategy(passport, oauthService) {
  // Пропускаем если нет credentials
  if (!process.env.MAILRU_CLIENT_ID || !process.env.MAILRU_CLIENT_SECRET) {
    console.warn(
      "⚠️  Mail.ru OAuth не настроен (пропущены MAILRU_CLIENT_ID/SECRET)"
    );
    return;
  }

  passport.use(
    "mailru",
    new MailRuStrategy(
      {
        clientID: process.env.MAILRU_CLIENT_ID,
        clientSecret: process.env.MAILRU_CLIENT_SECRET,
        callbackURL: process.env.MAILRU_CALLBACK_URL,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Получаем sessionId из query или cookie
          const sessionId = req.query.state || req.cookies?.guestSessionId;

          // Нормализуем профиль Mail.ru
          const normalizedProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value || profile.email,
            displayName:
              profile.displayName ||
              `${profile.first_name} ${profile.last_name}`,
            name: {
              givenName: profile.first_name,
              familyName: profile.last_name,
            },
            photos: profile.image ? [{ value: profile.image }] : [],
            accessToken,
            refreshToken,
            expiresAt: null,
            _json: profile._json,
          };

          const user = await oauthService.findOrCreateUserFromOAuth(
            "mailru",
            normalizedProfile,
            sessionId
          );

          done(null, user);
        } catch (error) {
          console.error("[MailRuStrategy] Error:", error);
          done(error, null);
        }
      }
    )
  );
}
