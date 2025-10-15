#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function clearReviewImages() {
  try {
    console.log(
      "🗑️  Начинаем удаление физических файлов изображений отзывов..."
    );

    const reviewsDir = path.join(process.cwd(), "uploads", "reviews");

    // Проверяем, существует ли директория
    try {
      await fs.access(reviewsDir);
    } catch (error) {
      console.log("📁 Директория reviews не найдена, создаем...");
      await fs.mkdir(reviewsDir, { recursive: true });
      console.log("✅ Директория создана, но файлов для удаления нет");
      return;
    }

    // Читаем содержимое директории
    const files = await fs.readdir(reviewsDir);

    if (files.length === 0) {
      console.log("📁 Директория reviews пуста");
      return;
    }

    console.log(`📸 Найдено файлов: ${files.length}`);

    // Удаляем все файлы
    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(reviewsDir, file);
      try {
        await fs.unlink(filePath);
        deletedCount++;
        console.log(`   ✅ Удален: ${file}`);
      } catch (error) {
        console.log(`   ❌ Ошибка при удалении ${file}:`, error.message);
      }
    }

    console.log(`✅ Удалено файлов: ${deletedCount} из ${files.length}`);
  } catch (error) {
    console.error("❌ Ошибка при удалении файлов:", error);
    process.exit(1);
  }
}

// Запускаем скрипт
clearReviewImages();
