#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Инициализируем Prisma
const prisma = new PrismaClient();

async function clearAllReviews() {
  try {
    console.log("🗑️  Начинаем удаление всех отзывов...");

    // Сначала удаляем изображения отзывов
    console.log("📸 Удаляем изображения отзывов...");
    const deletedImages = await prisma.publicReviewImage.deleteMany({});
    console.log(`   Удалено изображений: ${deletedImages.count}`);

    // Затем удаляем сами отзывы
    console.log("📝 Удаляем отзывы...");
    const deletedReviews = await prisma.publicReview.deleteMany({});
    console.log(`   Удалено отзывов: ${deletedReviews.count}`);

    console.log("✅ Все отзывы успешно удалены!");
    console.log(
      `📊 Итого удалено: ${deletedReviews.count} отзывов и ${deletedImages.count} изображений`
    );
  } catch (error) {
    console.error("❌ Ошибка при удалении отзывов:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
clearAllReviews();
