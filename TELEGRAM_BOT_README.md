# 🤖 Telegram Bot для автоматической публикации контента

## Что реализовано

Система автоматически публикует в Telegram чаты:
- ✅ **Товары по категориям** - с фото, ценами, остатками
- ✅ **Товары в наличии** - отдельный чат для быстрых продаж
- ✅ **Отзывы клиентов** - с фото и рейтингом
- ✅ **Рецепты** - со ссылками на сайт

## Ключевые возможности

### 🔄 Умное управление сообщениями
- Автоматическое обновление при редактировании товара
- Зачеркивание снятых с продажи товаров
- Добавление/удаление фото в сообщениях
- Пересоздание сообщений после 48 часов (ограничение Telegram)

### 📊 Очередь сообщений
- Защита от перегрузки Telegram API
- Автоматические повторы при ошибках (3 попытки)
- Обработка каждые 10 секунд

### 🎯 Гибкая настройка
- Категории товаров → отдельные чаты/треды
- Настройка специальных чатов через API или SQL
- Поддержка топиков в супергруппах

## 📁 Структура файлов

### Новые файлы
```
backend/
├── src/services/telegram-bot.js          # Основная логика бота
├── prisma/migrations/add_telegram_bot_tables/
│   └── migration.sql                      # Миграция БД
├── TELEGRAM_BOT_SETUP.md                  # Полная документация
├── TELEGRAM_BOT_QUICK_START.md            # Быстрый старт
├── IMPLEMENTATION_SUMMARY.md              # Техническая сводка
└── TELEGRAM_BOT_README.md                 # Этот файл
```

### Модифицированные файлы
```
backend/
├── prisma/schema.prisma                   # +5 новых моделей
├── src/services/telegram.js               # Расширен новыми методами
├── src/routes/admin.js                    # +интеграция с товарами и категориями
├── src/routes/public-reviews.js           # +интеграция с отзывами
├── src/server.js                          # +обработчик очереди
└── package.json                           # +form-data
```

## 🚀 Быстрый старт

### 1. Установка
```bash
npm install
```

### 2. Настройка .env
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
FRONTEND_URL=https://your-domain.com
```

### 3. База данных
```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Настройка чатов

**Получите ID чата:**
1. Добавьте бота в чат как администратора
2. Отправьте сообщение в чат
3. Откройте: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Скопируйте `"chat":{"id":-1002604900752}`

**Создайте категории (SQL):**
```sql
INSERT INTO "Category" (name, "telegramChatId", "telegramThreadId", "isActive", "createdAt", "updatedAt")
VALUES ('Категория 1', '-1002604900752', '1383', true, NOW(), NOW());
```

**Настройте специальные чаты (SQL):**
```sql
INSERT INTO "TelegramSettings" (key, "chatId", "threadId", "createdAt", "updatedAt")
VALUES 
  ('in_stock_chat', '-1002604900999', NULL, NOW(), NOW()),
  ('reviews_chat', '-1002604900998', NULL, NOW(), NOW()),
  ('recipes_chat', '-1002604900997', NULL, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET "chatId" = EXCLUDED."chatId", "updatedAt" = NOW();
```

### 5. Запуск
```bash
npm run dev
```

Проверьте логи:
```
[telegram-bot] Message queue processor enabled ✓
```

## 📖 Документация

- **[TELEGRAM_BOT_QUICK_START.md](./TELEGRAM_BOT_QUICK_START.md)** - пошаговая инструкция
- **[TELEGRAM_BOT_SETUP.md](./TELEGRAM_BOT_SETUP.md)** - полное руководство
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - техническая сводка

## 🎯 Примеры использования

### API для управления категориями
```bash
# Создать категорию
POST /api/admin/categories
{
  "name": "Морепродукты",
  "telegramChatId": "-1002604900752",
  "telegramThreadId": "1383"
}

# Получить список категорий
GET /api/admin/categories

# Обновить категорию
PATCH /api/admin/categories/1
{
  "isActive": false
}
```

### Настройка специальных чатов
```bash
PUT /api/admin/telegram-settings/in_stock_chat
{
  "chatId": "-1002604900999",
  "description": "Чат для товаров в наличии"
}
```

## 🔍 Мониторинг

### Проверка очереди
```sql
-- Статистика
SELECT status, COUNT(*) FROM "TelegramMessageQueue" GROUP BY status;

-- Ошибки
SELECT * FROM "TelegramMessageQueue" WHERE status = 'FAILED' ORDER BY "updatedAt" DESC LIMIT 10;
```

### Проверка сообщений
```sql
SELECT p.title, c.name, ptm.sentAt 
FROM "ProductTelegramMessage" ptm
JOIN "Product" p ON p.id = ptm.productId
JOIN "Category" c ON c.id = ptm.categoryId
ORDER BY ptm.sentAt DESC LIMIT 20;
```

## ⚙️ Как работает

```
Создание товара
    ↓
Проверка категории в БД
    ↓
Добавление задачи в очередь
    ↓
Обработчик (каждые 10 сек)
    ↓
Отправка в Telegram
    ↓
Сохранение messageId в БД
    ↓
Возможность редактирования
```

## ❗ Важные моменты

1. **Название категории** в `Category.name` должно совпадать с `Product.category`
2. **Бот должен быть администратором** во всех чатах
3. **ID чата супергруппы** начинается с `-100`
4. **48 часов** - лимит Telegram на редактирование (система автоматически пересоздает)
5. **Очередь** обрабатывается асинхронно для защиты от перегрузки API

## 🎨 Формат сообщений

Все сообщения используют **HTML разметку**:
- `<b>Жирный текст</b>`
- `<s>Зачеркнутый</s>`
- `<a href="url">Ссылка</a>`
- Эмодзи для визуального улучшения

## 🆘 Решение проблем

### Сообщения не отправляются
- Проверьте `TELEGRAM_BOT_TOKEN` в .env
- Убедитесь, что бот добавлен в чаты
- Проверьте права администратора

### "Chat not found"
- ID должен начинаться с `-` для супергрупп
- Пример: `-1002604900752`

### Не удается редактировать
- Проверьте права администратора
- Возможно прошло 48 часов (система пересоздаст автоматически)

## 📊 База данных

### Новые таблицы
- `Category` - категории с привязкой к чатам
- `ProductTelegramMessage` - история сообщений о товарах
- `InStockTelegramMessage` - сообщения "в наличии"
- `TelegramSettings` - настройки специальных чатов
- `TelegramMessageQueue` - очередь сообщений

## 🔐 Безопасность

- ✅ Токен бота только в .env (не коммитится)
- ✅ API управления требует авторизации админа
- ✅ Валидация всех входных данных
- ✅ Graceful обработка ошибок

## 📈 Производительность

- Очередь: 10 сообщений за раз
- Интервал: каждые 10 секунд
- Retry: 3 попытки с паузой 5 минут
- Нет блокировки основного потока

## ✨ Готово к работе!

После настройки система автоматически:
- Публикует новые товары в соответствующие чаты
- Обновляет информацию при редактировании
- Управляет товарами в наличии
- Делится отзывами клиентов
- Анонсирует новые рецепты

**Все полностью автоматически!** 🎉
