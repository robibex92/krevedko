import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadRoot = path.resolve(__dirname, "../uploads");
export const uploadProductsDir = path.join(uploadRoot, "products");
export const uploadPaymentsDir = path.join(uploadRoot, "payments");
export const uploadAvatarsDir = path.join(uploadRoot, "avatars");
export const uploadReviewsDir = path.join(uploadRoot, "reviews");

for (const dir of [uploadProductsDir, uploadPaymentsDir, uploadAvatarsDir, uploadReviewsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const imageMimes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function makeMulterStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : "";
      const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`;
      cb(null, name);
    },
  });
}

export function makeImageUpload({ dir, maxFiles = 1, fileSizeMb = 5 }) {
  const uploadLimitBytes = Math.max(1, Number(fileSizeMb)) * 1024 * 1024;
  return multer({
    storage: makeMulterStorage(dir),
    limits: { fileSize: uploadLimitBytes, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (imageMimes.has(file.mimetype)) cb(null, true);
      else cb(new Error("INVALID_FILE_TYPE"));
    },
  });
}

export const paymentUpload = makeImageUpload({ dir: uploadPaymentsDir });
export const avatarUpload = makeImageUpload({ dir: uploadAvatarsDir });
export const productUpload = makeImageUpload({ dir: uploadProductsDir });
export const reviewUpload = makeImageUpload({ dir: uploadReviewsDir, maxFiles: 5 });
