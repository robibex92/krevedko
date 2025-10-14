-- Добавление индексов для оптимизации производительности

-- Индексы для таблицы Order (частые запросы по userId, status, createdAt)
CREATE INDEX IF NOT EXISTS "Order_userId_status_idx" ON "Order"("userId", "status");
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Order_collectionId_idx" ON "Order"("collectionId");

-- Индексы для таблицы Product (частые запросы по category, isActive)
CREATE INDEX IF NOT EXISTS "Product_category_isActive_idx" ON "Product"("category", "isActive");
CREATE INDEX IF NOT EXISTS "Product_isActive_stockQuantity_idx" ON "Product"("isActive", "stockQuantity");
CREATE INDEX IF NOT EXISTS "Product_canPickupNow_isActive_idx" ON "Product"("canPickupNow", "isActive") WHERE "canPickupNow" = true;

-- Индексы для таблицы CartItem (частые запросы по userId, collectionId, sessionId)
CREATE INDEX IF NOT EXISTS "CartItem_userId_collectionId_isActive_idx" ON "CartItem"("userId", "collectionId", "isActive") WHERE "userId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "CartItem_sessionId_collectionId_isActive_idx" ON "CartItem"("sessionId", "collectionId", "isActive") WHERE "sessionId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "CartItem_productId_idx" ON "CartItem"("productId");

-- Индексы для таблицы OrderItem (аналитика и отчеты)
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

-- Индексы для таблицы Notification (частые запросы по userId и status)
CREATE INDEX IF NOT EXISTS "Notification_userId_status_idx" ON "Notification"("userId", "status");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- Индексы для таблицы Review (частые запросы по productId, isApproved)
CREATE INDEX IF NOT EXISTS "Review_productId_isApproved_idx" ON "Review"("productId", "isApproved");
CREATE INDEX IF NOT EXISTS "Review_userId_idx" ON "Review"("userId");

-- Индексы для таблицы Favorite (частые запросы по userId)
CREATE INDEX IF NOT EXISTS "Favorite_userId_idx" ON "Favorite"("userId");
CREATE INDEX IF NOT EXISTS "Favorite_productId_idx" ON "Favorite"("productId");

-- Индексы для таблицы RefreshToken (поиск по userId для logout all)
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt") WHERE "revokedAt" IS NULL;

-- Индексы для таблицы Recipe (поиск по slug, isPublished)
CREATE INDEX IF NOT EXISTS "Recipe_slug_isPublished_idx" ON "Recipe"("slug", "isPublished");
CREATE INDEX IF NOT EXISTS "Recipe_authorId_idx" ON "Recipe"("authorId");

-- Индексы для таблицы TelegramMessageQueue (обработка очереди)
CREATE INDEX IF NOT EXISTS "TelegramMessageQueue_status_scheduledFor_idx" ON "TelegramMessageQueue"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "TelegramMessageQueue_status_attempts_idx" ON "TelegramMessageQueue"("status", "attempts") WHERE "status" = 'FAILED';

-- Индексы для таблицы Collection (часто запрашиваемые активные коллекции)
CREATE INDEX IF NOT EXISTS "Collection_status_startsAt_idx" ON "Collection"("status", "startsAt" DESC);
CREATE INDEX IF NOT EXISTS "Collection_status_endsAt_idx" ON "Collection"("status", "endsAt" DESC);

-- Комментарий о важности индексов
COMMENT ON INDEX "Order_userId_status_idx" IS 'Composite index for filtering orders by user and status';
COMMENT ON INDEX "Product_category_isActive_idx" IS 'Composite index for fetching active products by category';
COMMENT ON INDEX "CartItem_userId_collectionId_isActive_idx" IS 'Composite index for user cart queries';

