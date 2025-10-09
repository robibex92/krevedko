-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramThreadId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTelegramMessage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "messageId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "mediaType" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEditedAt" TIMESTAMP(3),
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InStockTelegramMessage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "messageId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InStockTelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSettings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "chatId" TEXT,
    "threadId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramMessageQueue" (
    "id" SERIAL NOT NULL,
    "messageType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramMessageQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "ProductTelegramMessage_productId_idx" ON "ProductTelegramMessage"("productId");

-- CreateIndex
CREATE INDEX "ProductTelegramMessage_categoryId_idx" ON "ProductTelegramMessage"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTelegramMessage_productId_categoryId_key" ON "ProductTelegramMessage"("productId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InStockTelegramMessage_productId_key" ON "InStockTelegramMessage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSettings_key_key" ON "TelegramSettings"("key");

-- CreateIndex
CREATE INDEX "TelegramMessageQueue_status_scheduledFor_idx" ON "TelegramMessageQueue"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "TelegramMessageQueue_messageType_idx" ON "TelegramMessageQueue"("messageType");

-- AddForeignKey
ALTER TABLE "ProductTelegramMessage" ADD CONSTRAINT "ProductTelegramMessage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTelegramMessage" ADD CONSTRAINT "ProductTelegramMessage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InStockTelegramMessage" ADD CONSTRAINT "InStockTelegramMessage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
