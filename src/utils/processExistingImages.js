import fs from "fs/promises";
import path from "path";
import { processImageWithWatermark, shouldAddWatermark } from "./watermark.js";

/**
 * Утилита для обработки существующих изображений с наложением водяного знака
 */

/**
 * Обрабатывает все изображения в директории
 * @param {string} directory - путь к директории
 * @param {Object} options - опции водяного знака
 */
export async function processDirectoryImages(directory, options = {}) {
  try {
    const files = await fs.readdir(directory);
    const results = [];

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = await fs.stat(filePath);

      if (stat.isFile() && shouldAddWatermark(filePath)) {
        try {
          await processImageWithWatermark(filePath, filePath, options);
          results.push({
            file,
            success: true,
            message: "Watermark added successfully",
          });
          console.log(`✅ Processed: ${file}`);
        } catch (error) {
          results.push({
            file,
            success: false,
            error: error.message,
          });
          console.error(`❌ Failed to process ${file}:`, error.message);
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Error processing directory:", error);
    throw error;
  }
}

/**
 * Обрабатывает изображения товаров
 */
export async function processProductImages() {
  const productsDir = path.resolve(process.cwd(), "uploads/products");

  console.log("🖼️ Processing product images...");
  const results = await processDirectoryImages(productsDir, {
    text: "Ля Креведко",
    opacity: 0.3,
    color: "#ffffff",
    rotation: -15,
    position: "center",
  });

  console.log(`📊 Processed ${results.length} product images`);
  return results;
}

/**
 * Обрабатывает изображения отзывов
 */
export async function processReviewImages() {
  const reviewsDir = path.resolve(process.cwd(), "uploads/reviews");

  console.log("🖼️ Processing review images...");
  const results = await processDirectoryImages(reviewsDir, {
    text: "Ля Креведко",
    opacity: 0.3,
    color: "#ffffff",
    rotation: -15,
    position: "center",
  });

  console.log(`📊 Processed ${results.length} review images`);
  return results;
}

/**
 * Обрабатывает изображения рецептов
 */
export async function processRecipeImages() {
  const recipesDir = path.resolve(process.cwd(), "uploads/recipes");

  console.log("🖼️ Processing recipe images...");
  const results = await processDirectoryImages(recipesDir, {
    text: "Ля Креведко",
    opacity: 0.3,
    color: "#ffffff",
    rotation: -15,
    position: "center",
  });

  console.log(`📊 Processed ${results.length} recipe images`);
  return results;
}

/**
 * Обрабатывает все изображения на сайте
 */
export async function processAllImages() {
  console.log("🚀 Starting watermark processing for all images...");

  const results = {
    products: [],
    reviews: [],
    recipes: [],
    total: 0,
    successful: 0,
    failed: 0,
  };

  try {
    // Обрабатываем изображения товаров
    results.products = await processProductImages();

    // Обрабатываем изображения отзывов
    results.reviews = await processReviewImages();

    // Обрабатываем изображения рецептов
    results.recipes = await processRecipeImages();

    // Подсчитываем статистику
    const allResults = [
      ...results.products,
      ...results.reviews,
      ...results.recipes,
    ];
    results.total = allResults.length;
    results.successful = allResults.filter((r) => r.success).length;
    results.failed = allResults.filter((r) => !r.success).length;

    console.log(`✅ Watermark processing completed!`);
    console.log(
      `📊 Total: ${results.total}, Successful: ${results.successful}, Failed: ${results.failed}`
    );

    return results;
  } catch (error) {
    console.error("❌ Error processing all images:", error);
    throw error;
  }
}

/**
 * CLI скрипт для обработки изображений
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case "products":
      processProductImages().then(() => process.exit(0));
      break;
    case "reviews":
      processReviewImages().then(() => process.exit(0));
      break;
    case "recipes":
      processRecipeImages().then(() => process.exit(0));
      break;
    case "all":
      processAllImages().then(() => process.exit(0));
      break;
    default:
      console.log(
        "Usage: node processExistingImages.js [products|reviews|recipes|all]"
      );
      process.exit(1);
  }
}
