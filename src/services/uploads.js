import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";

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
  const effectiveMb = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : Number(fileSizeMb);
  const uploadLimitBytes = Math.max(1, Number(effectiveMb)) * 1024 * 1024;

  return multer({
    storage: makeMulterStorage(dir),
    limits: { fileSize: uploadLimitBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (imageMimes.has(file.mimetype)) {
        cb(null, true);
      } else {
        console.warn("[upload] rejected file:", file.originalname, file.mimetype);
        cb(new Error("INVALID_FILE_TYPE"));
      }
    },
  });
}

function makeMediaUpload({ dir, maxFiles = 1, fileSizeMb = 50 }) {
  const envLimit = Number(process.env.UPLOAD_LIMIT_MB);
  const effectiveMb = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : Number(fileSizeMb);
  const uploadLimitBytes = Math.max(1, Number(effectiveMb)) * 1024 * 1024;
  const allowed = new Set([...imageMimes, ...videoMimes]);

  return multer({
    storage: makeMulterStorage(dir),
    limits: { fileSize: uploadLimitBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (allowed.has(file.mimetype)) {
        cb(null, true);
      } else {
        console.warn("[upload] rejected file:", file.originalname, file.mimetype);
        cb(new Error("INVALID_FILE_TYPE"));
      }
    },
  });
}

// --- экспорт готовых загрузчиков ---
export const productUpload = makeImageUpload({ dir: uploadProductsDir });
export const paymentUpload = makeImageUpload({ dir: uploadPaymentsDir });
export const avatarUpload = makeImageUpload({ dir: uploadAvatarsDir });
export const reviewUpload = makeImageUpload({ dir: uploadReviewsDir, maxFiles: 5 });
export const recipesUpload = makeMediaUpload({ dir: uploadRecipesDir, maxFiles: 10, fileSizeMb: 200 });
export const notificationUpload = makeImageUpload({ dir: uploadNotificationsDir, maxFiles: 3, fileSizeMb: 8 });

// --- тестовый роут для проверки ---
// пример использования (добавь в сервер):
//
// import { productUpload } from "./upload.js";
// app.post("/api/test-upload", productUpload.single("image"), (req, res) => {
//   if (!req.file) return res.status(400).json({ error: "Файл не принят" });
//   console.log("[upload] saved:", req.file);
//   res.json({ ok: true, path: `/uploads/products/${req.file.filename}` });
// });
