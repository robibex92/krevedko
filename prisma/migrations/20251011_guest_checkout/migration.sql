-- Migration: Guest Checkout Support
-- Добавляет поддержку заказов и корзин для неавторизованных пользователей

-- 1. Обновить CartItem для guest корзин
ALTER TABLE "CartItem" 
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "sessionId" TEXT;

-- Индексы для guest корзин
CREATE INDEX "CartItem_sessionId_collectionId_productId_idx" ON "CartItem"("sessionId", "collectionId", "productId");
CREATE INDEX "CartItem_sessionId_idx" ON "CartItem"("sessionId");

-- 2. Обновить Order для guest заказов
ALTER TABLE "Order"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "isGuestOrder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guestName" TEXT,
  ADD COLUMN "guestPhone" TEXT,
  ADD COLUMN "guestEmail" TEXT,
  ADD COLUMN "guestContactMethod" TEXT,
  ADD COLUMN "guestContactInfo" TEXT;

-- Индексы для guest заказов
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");
CREATE INDEX "Order_isGuestOrder_idx" ON "Order"("isGuestOrder");
CREATE INDEX "Order_guestPhone_idx" ON "Order"("guestPhone");
CREATE INDEX "Order_guestEmail_idx" ON "Order"("guestEmail");

-- 3. Обновить существующие заказы (установить isGuestOrder = false для всех существующих)
UPDATE "Order" SET "isGuestOrder" = false WHERE "userId" IS NOT NULL;

