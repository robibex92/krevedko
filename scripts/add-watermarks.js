#!/usr/bin/env node

/**
 * CLI скрипт для добавления водяного знака "Ля Креведко" ко всем изображениям
 *
 * Использование:
 * node scripts/add-watermarks.js [products|reviews|recipes|all]
 *
 * Примеры:
 * node scripts/add-watermarks.js all          # Обработать все изображения
 * node scripts/add-watermarks.js products     # Только изображения товаров
 * node scripts/add-watermarks.js reviews      # Только изображения отзывов
 * node scripts/add-watermarks.js recipes      # Только изображения рецептов
 */

import {
  processAllImages,
  processProductImages,
  processReviewImages,
  processRecipeImages,
} from "../src/utils/processExistingImages.js";

async function main() {
  const command = process.argv[2];

  console.log("🖼️  Watermark Processing Tool");
  console.log("==============================");

  try {
    switch (command) {
      case "products":
        console.log("📦 Processing product images...");
        const productResults = await processProductImages();
        console.log(`✅ Processed ${productResults.length} product images`);
        break;

      case "reviews":
        console.log("⭐ Processing review images...");
        const reviewResults = await processReviewImages();
        console.log(`✅ Processed ${reviewResults.length} review images`);
        break;

      case "recipes":
        console.log("🍳 Processing recipe images...");
        const recipeResults = await processRecipeImages();
        console.log(`✅ Processed ${recipeResults.length} recipe images`);
        break;

      case "all":
        console.log("🚀 Processing all images...");
        const allResults = await processAllImages();
        console.log(`✅ Total processed: ${allResults.total}`);
        console.log(`✅ Successful: ${allResults.successful}`);
        console.log(`❌ Failed: ${allResults.failed}`);
        break;

      default:
        console.log("❌ Invalid command");
        console.log("");
        console.log(
          "Usage: node scripts/add-watermarks.js [products|reviews|recipes|all]"
        );
        console.log("");
        console.log("Commands:");
        console.log("  products  - Process only product images");
        console.log("  reviews   - Process only review images");
        console.log("  recipes   - Process only recipe images");
        console.log("  all       - Process all images");
        process.exit(1);
    }

    console.log("");
    console.log("🎉 Watermark processing completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during watermark processing:", error);
    process.exit(1);
  }
}

// Запускаем только если скрипт вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
