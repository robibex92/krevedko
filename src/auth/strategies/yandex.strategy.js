import { Strategy as YandexStrategy } from "passport-yandex";

/**
 * Настройка Yandex OAuth стратегии для Passport.js
 */
export function configureYandexStrategy(passport, oauthService) {
  // Пропускаем если нет credentials
  if (!process.env.YANDEX_CLIENT_ID || !process.env.YANDEX_CLIENT_SECRET) {
    console.warn(
      "⚠️  Yandex OAuth не настроен (пропущены YANDEX_CLIENT_ID/SECRET)"
    );
    return;
  }

  passport.use(
    "yandex",
    new YandexStrategy(
      {
        clientID: process.env.YANDEX_CLIENT_ID,
        clientSecret: process.env.YANDEX_CLIENT_SECRET,
        callbackURL: process.env.YANDEX_CALLBACK_URL,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Получаем sessionId из query или cookie
          const sessionId = req.query.state || req.cookies?.guestSessionId;

          // Нормализуем профиль Yandex
          const normalizedProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value || profile.default_email,
            displayName: profile.displayName || profile.real_name,
            name: {
              givenName: profile.name?.givenName || profile.first_name,
              familyName: profile.name?.familyName || profile.last_name,
            },
            photos: profile.default_avatar_id
              ? [
                  {
                    value: `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`,
                  },
                ]
              : [],
            accessToken,
            refreshToken,
            expiresAt: null,
            _json: profile._json,
          };

          const user = await oauthService.findOrCreateUserFromOAuth(
            "yandex",
            normalizedProfile,
            sessionId
          );

          done(null, user);
        } catch (error) {
          console.error("[YandexStrategy] Error:", error);
          done(error, null);
        }
      }
    )
  );
}
