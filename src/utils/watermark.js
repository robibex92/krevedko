import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

/**
 * Утилита для наложения водяного знака "Ля Креведко" на изображения
 */

/**
 * Создает SVG водяного знака
 */
function createWatermarkSVG(text = "Ля Креведко", options = {}) {
  const {
    fontSize = 48,
    opacity = 0.3,
    color = "#ffffff",
    rotation = -15,
    fontFamily = "Arial, sans-serif",
    fontWeight = "bold",
    imageWidth = 400,
    imageHeight = 200,
  } = options;

  // Вычисляем размеры SVG на основе размера изображения
  const svgWidth = Math.max(400, imageWidth);
  const svgHeight = Math.max(200, imageHeight);
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .watermark-text {
            font-family: ${fontFamily};
            font-size: ${fontSize}px;
            font-weight: ${fontWeight};
            fill: ${color};
            fill-opacity: ${opacity};
            text-anchor: middle;
            dominant-baseline: central;
          }
        </style>
      </defs>
      <g transform="rotate(${rotation} ${centerX} ${centerY})">
        <text x="${centerX}" y="${centerY}" class="watermark-text">${text}</text>
      </g>
    </svg>
  `;

  return Buffer.from(svg);
}

/**
 * Накладывает водяной знак на изображение
 * @param {string} inputPath - путь к исходному изображению
 * @param {string} outputPath - путь для сохранения изображения с водяным знаком
 * @param {Object} options - опции водяного знака
 */
export async function addWatermarkToImage(inputPath, outputPath, options = {}) {
  try {
    const {
      text = "Ля Креведко",
      fontSize = 48,
      opacity = 0.3,
      color = "#ffffff",
      rotation = -15,
      position = "center", // center, top-left, top-right, bottom-left, bottom-right
    } = options;

    // Проверяем, является ли файл HEIC
    const ext = path.extname(inputPath).toLowerCase();
    const isHeic = ext === ".heic" || ext === ".heif";

    let sharpInstance;
    if (isHeic) {
      // Для HEIC файлов используем специальную обработку
      try {
        sharpInstance = sharp(inputPath, { failOn: "none" });
      } catch (error) {
        console.warn(
          "Sharp cannot process HEIC directly, skipping watermark:",
          error.message
        );
        return false;
      }
    } else {
      sharpInstance = sharp(inputPath);
    }

    // Получаем метаданные изображения
    const metadata = await sharpInstance.metadata();
    let { width, height, orientation } = metadata;

    // Исправляем ориентацию для изображений с iPhone
    if (orientation && orientation > 1) {
      console.log(
        `Correcting orientation: ${orientation} for image ${inputPath}`
      );
      sharpInstance = sharpInstance.rotate(); // Автоматически поворачивает на основе EXIF

      // Получаем новые размеры после поворота
      const rotatedMetadata = await sharpInstance.metadata();
      width = rotatedMetadata.width;
      height = rotatedMetadata.height;
    }

    // Адаптивный размер шрифта в зависимости от размера изображения
    const adaptiveFontSize = Math.max(24, Math.min(72, Math.floor(width / 15)));

    // Создаем SVG водяного знака
    const watermarkSVG = createWatermarkSVG(text, {
      fontSize: adaptiveFontSize,
      opacity,
      color,
      rotation,
      imageWidth: width,
      imageHeight: height,
    });

    // Вычисляем позицию водяного знака
    let gravity = "center";
    switch (position) {
      case "top-left":
        gravity = "northwest";
        break;
      case "top-right":
        gravity = "northeast";
        break;
      case "bottom-left":
        gravity = "southwest";
        break;
      case "bottom-right":
        gravity = "southeast";
        break;
      default:
        gravity = "center";
    }

    // Накладываем водяной знак
    await sharpInstance
      .composite([
        {
          input: watermarkSVG,
          gravity: gravity,
          blend: "over",
        },
      ])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    console.log(`Watermark added to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
}

/**
 * Обрабатывает загруженное изображение с наложением водяного знака
 * @param {Buffer|string} input - входное изображение (Buffer или путь к файлу)
 * @param {string} outputPath - путь для сохранения
 * @param {Object} options - опции водяного знака
 */
export async function processImageWithWatermark(
  input,
  outputPath,
  options = {}
) {
  try {
    // Если input - это путь к файлу, читаем его
    let imageBuffer;
    if (typeof input === "string") {
      imageBuffer = await fs.readFile(input);
    } else {
      imageBuffer = input;
    }

    // Создаем временный файл для обработки
    const tempPath = outputPath + ".temp";

    // Сохраняем исходное изображение во временный файл
    await fs.writeFile(tempPath, imageBuffer);

    // Накладываем водяной знак
    await addWatermarkToImage(tempPath, outputPath, options);

    // Удаляем временный файл
    await fs.unlink(tempPath);

    return true;
  } catch (error) {
    console.error("Error processing image with watermark:", error);
    throw error;
  }
}

/**
 * Создает водяной знак для разных размеров изображений
 * @param {string} inputPath - путь к исходному изображению
 * @param {string} outputDir - директория для сохранения
 * @param {Array} sizes - массив размеров [{width, height, suffix}]
 * @param {Object} options - опции водяного знака
 */
export async function createWatermarkedVariants(
  inputPath,
  outputDir,
  sizes = [],
  options = {}
) {
  const results = [];

  for (const size of sizes) {
    const { width, height, suffix = "" } = size;
    const filename = path.basename(inputPath, path.extname(inputPath));
    const ext = path.extname(inputPath);
    const outputPath = path.join(outputDir, `${filename}${suffix}${ext}`);

    try {
      // Изменяем размер изображения
      await sharp(inputPath)
        .resize(width, height, {
          fit: "cover",
          position: "center",
        })
        .toFile(outputPath + ".temp");

      // Накладываем водяной знак
      await addWatermarkToImage(outputPath + ".temp", outputPath, options);

      // Удаляем временный файл
      await fs.unlink(outputPath + ".temp");

      results.push({
        size: `${width}x${height}`,
        path: outputPath,
        success: true,
      });
    } catch (error) {
      console.error(
        `Error creating variant ${size.width}x${size.height}:`,
        error
      );
      results.push({
        size: `${width}x${height}`,
        path: outputPath,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Проверяет, нужно ли накладывать водяной знак на изображение
 * @param {string} filePath - путь к файлу
 * @returns {boolean}
 */
export function shouldAddWatermark(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".heic",
    ".heif",
  ];
  return imageExtensions.includes(ext);
}

/**
 * Получает оптимальные параметры водяного знака для размера изображения
 * @param {number} width - ширина изображения
 * @param {number} height - высота изображения
 * @returns {Object} параметры водяного знака
 */
export function getOptimalWatermarkOptions(width, height) {
  const area = width * height;

  // Определяем размер шрифта в зависимости от площади изображения
  let fontSize = 24;
  if (area > 1000000) {
    // > 1MP
    fontSize = 48;
  } else if (area > 500000) {
    // > 0.5MP
    fontSize = 36;
  } else if (area > 100000) {
    // > 0.1MP
    fontSize = 28;
  }

  return {
    fontSize,
    opacity: 0.3,
    color: "#ffffff",
    rotation: -15,
    position: "center",
  };
}
