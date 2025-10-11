-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'development';

-- Комментарий: Добавлено поле paymentMethod для хранения способа оплаты
-- Возможные значения: "development" (временно), "online" (онлайн-касса), "invoice" (счет), "cash" (наличные)

