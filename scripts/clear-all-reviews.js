#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Инициализируем Prisma
const prisma = new PrismaClient();

async function clearAllReviewsAndFiles() {
  try {
    console.log("🗑️  Начинаем полную очистку всех отзывов...");
    console.log("");

    // 1. Удаляем из базы данных
    console.log("📊 Удаляем из базы данных...");

    // Сначала удаляем изображения отзывов
    console.log("📸 Удаляем изображения отзывов из БД...");
    const deletedImages = await prisma.publicReviewImage.deleteMany({});
    console.log(`   ✅ Удалено изображений из БД: ${deletedImages.count}`);

    // Затем удаляем сами отзывы
    console.log("📝 Удаляем отзывы из БД...");
    const deletedReviews = await prisma.publicReview.deleteMany({});
    console.log(`   ✅ Удалено отзывов из БД: ${deletedReviews.count}`);

    console.log("");

    // 2. Удаляем физические файлы
    console.log("💾 Удаляем физические файлы...");

    const reviewsDir = path.join(process.cwd(), "uploads", "reviews");

    // Проверяем, существует ли директория
    try {
      await fs.access(reviewsDir);
    } catch (error) {
      console.log(
        "📁 Директория reviews не найдена, пропускаем удаление файлов"
      );
    }

    // Читаем содержимое директории
    const files = await fs.readdir(reviewsDir);

    if (files.length === 0) {
      console.log("📁 Директория reviews пуста");
    } else {
      console.log(`📸 Найдено файлов для удаления: ${files.length}`);

      // Удаляем все файлы
      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(reviewsDir, file);
        try {
          await fs.unlink(filePath);
          deletedCount++;
        } catch (error) {
          console.log(`   ❌ Ошибка при удалении ${file}:`, error.message);
        }
      }

      console.log(`   ✅ Удалено файлов: ${deletedCount} из ${files.length}`);
    }

    console.log("");
    console.log("🎉 Полная очистка завершена!");
    console.log(`📊 Итого удалено:`);
    console.log(`   - Отзывов: ${deletedReviews.count}`);
    console.log(`   - Изображений из БД: ${deletedImages.count}`);
    console.log(
      `   - Физических файлов: ${files.length > 0 ? files.length : 0}`
    );
  } catch (error) {
    console.error("❌ Ошибка при очистке отзывов:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
clearAllReviewsAndFiles();
