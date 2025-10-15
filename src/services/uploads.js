import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";
import {
  processImageWithWatermark,
  shouldAddWatermark,
} from "../utils/watermark.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- директории для загрузок ---
const uploadRoot = path.resolve(process.cwd(), "uploads");
export const uploadProductsDir = path.join(uploadRoot, "products");
export const uploadPaymentsDir = path.join(uploadRoot, "payments");
export const uploadAvatarsDir = path.join(uploadRoot, "avatars");
export const uploadReviewsDir = path.join(uploadRoot, "reviews");
export const uploadRecipesDir = path.join(uploadRoot, "recipes");
export const uploadNotificationsDir = path.join(uploadRoot, "notifications");

// создаём папки, если их нет
for (const dir of [
  uploadRoot,
  uploadProductsDir,
  uploadPaymentsDir,
  uploadAvatarsDir,
  uploadReviewsDir,
  uploadRecipesDir,
  uploadNotificationsDir,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

// --- допустимые mime-типы ---
const imageMimes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const videoMimes = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/mpeg",
]);

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".m4v",
  ".avi",
  ".mpg",
  ".mpeg",
]);

// --- генерация имени файла ---
function makeMulterStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const mimetype = (file.mimetype || "").toLowerCase();
      const isHeic = /\.(heic|heif)$/i.test(ext);

      let safeExt = ".bin";
      if (imageExtensions.has(ext)) {
        safeExt = ext;
      } else if (isHeic) {
        safeExt = ".jpg";
      } else if (videoExtensions.has(ext)) {
        safeExt = ext;
      } else if (mimetype.startsWith("image/")) {
        safeExt = ".jpg";
      } else if (mimetype.startsWith("video/")) {
        safeExt = ".mp4";
      }

      const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`;
      cb(null, name);
    },
  });
}

// --- фабрика загрузчика изображений ---
function makeImageUpload({ dir, maxFiles = 1, fileSizeMb = 5 }) {
  const envLimit = Number(process.env.UPLOAD_LIMIT_MB);
  const effectiveMb =
    Number.isFinite(envLimit) && envLimit > 0 ? envLimit : Number(fileSizeMb);
  const uploadLimitBytes = Math.max(1, Number(effectiveMb)) * 1024 * 1024;

  return multer({
    storage: makeMulterStorage(dir),
    limits: { fileSize: uploadLimitBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (imageMimes.has(file.mimetype)) {
        cb(null, true);
      } else {
        console.warn(
          "[upload] rejected file:",
          file.originalname,
          file.mimetype
        );
        cb(new Error("INVALID_FILE_TYPE"));
      }
    },
  });
}

function makeMediaUpload({ dir, maxFiles = 1, fileSizeMb = 50 }) {
  const envLimit = Number(process.env.UPLOAD_LIMIT_MB);
  const effectiveMb =
    Number.isFinite(envLimit) && envLimit > 0 ? envLimit : Number(fileSizeMb);
  const uploadLimitBytes = Math.max(1, Number(effectiveMb)) * 1024 * 1024;
  const allowed = new Set([...imageMimes, ...videoMimes]);

  return multer({
    storage: makeMulterStorage(dir),
    limits: { fileSize: uploadLimitBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (allowed.has(file.mimetype)) {
        cb(null, true);
      } else {
        console.warn(
          "[upload] rejected file:",
          file.originalname,
          file.mimetype
        );
        cb(new Error("INVALID_FILE_TYPE"));
      }
    },
  });
}

// --- middleware для обработки изображений с водяным знаком ---
function watermarkMiddleware(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        // Обрабатываем загруженные файлы
        if (req.file) {
          // Одиночный файл
          console.log(
            "[WatermarkMiddleware] Processing single file:",
            req.file.path
          );
          if (shouldAddWatermark(req.file.path)) {
            console.log(
              "[WatermarkMiddleware] Adding watermark to:",
              req.file.path
            );
            await processImageWithWatermark(req.file.path, req.file.path, {
              text: "Ля Креведко",
              opacity: 0.3,
              color: "#ffffff",
              rotation: -15,
              position: "center",
            });
            console.log(
              "[WatermarkMiddleware] Watermark added to:",
              req.file.path
            );
          } else {
            console.log(
              "[WatermarkMiddleware] Skipping watermark for:",
              req.file.path
            );
          }
        } else if (req.files && req.files.length > 0) {
          // Множественные файлы
          console.log(
            "[WatermarkMiddleware] Processing multiple files:",
            req.files.length
          );
          for (const file of req.files) {
            console.log("[WatermarkMiddleware] Processing file:", file.path);
            if (shouldAddWatermark(file.path)) {
              console.log(
                "[WatermarkMiddleware] Adding watermark to:",
                file.path
              );
              await processImageWithWatermark(file.path, file.path, {
                text: "Ля Креведко",
                opacity: 0.3,
                color: "#ffffff",
                rotation: -15,
                position: "center",
              });
              console.log(
                "[WatermarkMiddleware] Watermark added to:",
                file.path
              );
            } else {
              console.log(
                "[WatermarkMiddleware] Skipping watermark for:",
                file.path
              );
            }
          }
        }

        next();
      } catch (watermarkError) {
        console.error("Error adding watermark:", watermarkError);
        // Не прерываем процесс загрузки, если водяной знак не удалось добавить
        next();
      }
    });
  };
}

// --- экспорт готовых загрузчиков ---
export const productUpload = watermarkMiddleware(
  makeImageUpload({ dir: uploadProductsDir })
);
export const paymentUpload = watermarkMiddleware(
  makeImageUpload({ dir: uploadPaymentsDir })
);
export const avatarUpload = makeImageUpload({ dir: uploadAvatarsDir }); // Без водяного знака
export const reviewUpload = watermarkMiddleware(
  makeImageUpload({ dir: uploadReviewsDir, maxFiles: 5 })
);
export const recipesUpload = watermarkMiddleware(
  makeMediaUpload({ dir: uploadRecipesDir, maxFiles: 10, fileSizeMb: 200 })
);
export const notificationUpload = watermarkMiddleware(
  makeImageUpload({ dir: uploadNotificationsDir, maxFiles: 3, fileSizeMb: 8 })
);

// --- экспорт базовых загрузчиков без водяного знака (для совместимости) ---
export const productUploadBase = makeImageUpload({ dir: uploadProductsDir });
export const paymentUploadBase = makeImageUpload({ dir: uploadPaymentsDir });
export const avatarUploadBase = makeImageUpload({ dir: uploadAvatarsDir });
export const reviewUploadBase = makeImageUpload({
  dir: uploadReviewsDir,
  maxFiles: 5,
});
export const recipesUploadBase = makeMediaUpload({
  dir: uploadRecipesDir,
  maxFiles: 10,
  fileSizeMb: 200,
});
export const notificationUploadBase = makeImageUpload({
  dir: uploadNotificationsDir,
  maxFiles: 3,
  fileSizeMb: 8,
});

// --- тестовый роут для проверки ---
// пример использования (добавь в сервер):
//
// import { productUpload } from "./upload.js";
// app.post("/api/test-upload", productUpload.single("image"), (req, res) => {
//   if (!req.file) return res.status(400).json({ error: "Файл не принят" });
//   console.log("[upload] saved:", req.file);
//   res.json({ ok: true, path: `/uploads/products/${req.file.filename}` });
// });
