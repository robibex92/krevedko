# Backend Documentation

## 📚 Основная документация

**Главный файл**: [`../PROJECT_DOCUMENTATION.md`](../PROJECT_DOCUMENTATION.md)

Включает:

- Последние изменения
- Быстрый старт
- Архитектура
- Развёртывание
- Устранение проблем

---

## 📋 Дополнительные документы

### Telegram Bot

📄 [`TELEGRAM_BOT_SETUP.md`](TELEGRAM_BOT_SETUP.md) - Настройка Telegram бота

### Платежи

📄 [`PAYMENT_INFRASTRUCTURE_READY.md`](PAYMENT_INFRASTRUCTURE_READY.md) - Готовая инфраструктура для интеграции платежей

---

## 🚀 Быстрый старт

```bash
# Установка
npm install

# Настройка
cp .env.example .env
# Отредактируйте .env

# Миграция БД
npx prisma migrate deploy
npx prisma generate

# Запуск
npm start
# или для разработки: npm run dev
```

---

## 🏗️ Структура

```
backend/
├── src/
│   ├── auth/              # OAuth strategies
│   ├── controllers/       # Controllers (new architecture)
│   ├── core/             # Base classes, DI, errors
│   ├── dto/              # Data Transfer Objects
│   ├── middleware/       # Express middleware
│   ├── repositories/     # Database access
│   ├── routes/           # Express routes
│   │   ├── v2/          # New routes (DI)
│   │   └── *.js         # Legacy routes
│   ├── services/        # Business logic
│   ├── validators/      # Joi validators
│   └── server.v2.js     # Entry point
└── prisma/
    └── schema.prisma
```

---

## 📊 API Endpoints

### Публичные

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/products` - Товары
- `GET /api/collections` - Сборы

### Авторизованные

- `GET /api/orders` - Мои заказы
- `POST /api/cart/submit` - Оформить заказ
- `GET /api/profile` - Профиль

### Админ

- `GET /api/admin/orders` - Все заказы
- `POST /api/admin/products` - Создать товар
- `PATCH /api/admin/orders/:id` - Обновить заказ

---

## 🔧 Технологии

- **Node.js** 18+ (рекомендуется 20+)
- **Express.js** - веб-фреймворк
- **Prisma** - ORM
- **PostgreSQL** - база данных
- **JWT** - аутентификация
- **Joi** - валидация
- **Awilix** - Dependency Injection
- **Winston** - логирование

---
