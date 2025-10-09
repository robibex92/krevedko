# Быстрый старт Telegram Bot

## 1. Установка зависимостей

```bash
cd backend
npm install
```

## 2. Настройка .env

Добавьте в файл `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
FRONTEND_URL=https://your-domain.com
```

## 3. Применение миграции БД

```bash
npx prisma migrate deploy
# или для разработки:
npx prisma migrate dev
```

Затем обновите Prisma Client:

```bash
npx prisma generate
```

## 4. Настройка категорий и чатов

### Вариант А: Через SQL (быстро)

Подключитесь к вашей PostgreSQL базе и выполните:

```sql
-- Создание категорий для товаров
INSERT INTO "Category" (name, "telegramChatId", "telegramThreadId", "isActive", "createdAt", "updatedAt")
VALUES 
  ('Ваша категория 1', '-1002604900752', '1383', true, NOW(), NOW()),
  ('Ваша категория 2', '-1002604900752', '1384', true, NOW(), NOW());

-- Настройка специальных чатов
INSERT INTO "TelegramSettings" (key, "chatId", "threadId", description, "createdAt", "updatedAt")
VALUES 
  ('in_stock_chat', '-1002604900999', NULL, 'Чат для товаров в наличии', NOW(), NOW()),
  ('reviews_chat', '-1002604900998', NULL, 'Чат для отзывов', NOW(), NOW()),
  ('recipes_chat', '-1002604900997', NULL, 'Чат для рецептов', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  "chatId" = EXCLUDED."chatId",
  "threadId" = EXCLUDED."threadId",
  description = EXCLUDED.description,
  "updatedAt" = NOW();
```

**ВАЖНО:** Замените ID чатов на ваши реальные значения!

### Вариант Б: Через API

После запуска сервера используйте API endpoints (требуется админ авторизация):

```bash
# Создать категорию
curl -X POST http://localhost:4002/api/admin/categories \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=your_session_cookie" \
  -d '{
    "name": "Ваша категория",
    "telegramChatId": "-1002604900752",
    "telegramThreadId": "1383"
  }'

# Настроить чат товаров в наличии
curl -X PUT http://localhost:4002/api/admin/telegram-settings/in_stock_chat \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=your_session_cookie" \
  -d '{
    "chatId": "-1002604900999",
    "threadId": null,
    "description": "Чат для товаров в наличии"
  }'
```

## 5. Как получить ID чата и треда

### ID чата:
1. Добавьте бота в ваш чат как администратора
2. Отправьте любое сообщение в чат
3. Откройте в браузере:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
4. Найдите `"chat":{"id":-1002604900752,...}` - это ваш ID чата

### ID треда (для топиков в супергруппах):
1. Создайте топик/тему в супергруппе
2. Отправьте сообщение в эту тему
3. В том же URL `getUpdates` найдите `"message_thread_id":1383`

**Важно:** ID чата для супергрупп начинается с `-100`

## 6. Запуск сервера

```bash
npm run dev
# или
npm start
```

В логах вы должны увидеть:
```
[telegram-bot] Message queue processor enabled
```

## 7. Проверка работы

### Создайте товар с категорией:

```bash
curl -X POST http://localhost:4002/api/admin/products \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=your_session_cookie" \
  -d '{
    "title": "Тестовый товар",
    "description": "Описание товара",
    "category": "Ваша категория 1",
    "unitLabel": "шт",
    "stepDecimal": "1",
    "priceKopecks": 10000,
    "isActive": true,
    "stockQuantity": "5"
  }'
```

Через 10-20 секунд (время обработки очереди) сообщение должно появиться в Telegram чате!

## 8. Мониторинг

### Проверка очереди сообщений:

```sql
-- Статус всех сообщений
SELECT status, COUNT(*) 
FROM "TelegramMessageQueue" 
GROUP BY status;

-- Ошибки
SELECT * 
FROM "TelegramMessageQueue" 
WHERE status = 'FAILED' 
ORDER BY "updatedAt" DESC 
LIMIT 5;
```

## Возможные проблемы

### "Unauthorized" в логах
- Проверьте правильность `TELEGRAM_BOT_TOKEN` в `.env`

### "Chat not found"
- Убедитесь, что бот добавлен в чат
- Проверьте правильность ID чата (должен начинаться с `-`)

### Сообщения не отправляются
- Проверьте, что у бота есть права администратора в чате
- Проверьте логи: `console.log` в server.js покажет ошибки обработки очереди

### Бот не может редактировать сообщения
- Права администратора обязательны
- Проверьте, что не прошло 48 часов (ограничение Telegram API)

## Дополнительная документация

Полная документация: `TELEGRAM_BOT_SETUP.md`

## Контрольный список

- [ ] Установлен пакет `form-data`
- [ ] `TELEGRAM_BOT_TOKEN` добавлен в `.env`
- [ ] Миграция БД применена
- [ ] Prisma Client обновлен (`npx prisma generate`)
- [ ] Категории созданы в БД
- [ ] Настройки спец. чатов заполнены
- [ ] Бот добавлен во все чаты как администратор
- [ ] Сервер запущен и в логах видно "Message queue processor enabled"
- [ ] Тестовый товар создан и появился в Telegram
