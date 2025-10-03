/*
  Warnings:

  - A unique constraint covering the columns `[orderNumber]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CollectionProduct" ADD COLUMN "displayStockHint" TEXT;
ALTER TABLE "CollectionProduct" ADD COLUMN "stockOverride" DECIMAL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "displayStockHint" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "addressApartment" TEXT;
ALTER TABLE "User" ADD COLUMN "addressHouse" TEXT;
ALTER TABLE "User" ADD COLUMN "addressStreet" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarPath" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerificationExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "emailVerificationTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- CreateTable
CREATE TABLE "PublicReview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublicReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublicReviewImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reviewId" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicReviewImage_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PublicReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CartItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantityDecimal" DECIMAL NOT NULL,
    "unitPriceKopecks" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CartItem" ("collectionId", "createdAt", "id", "productId", "quantityDecimal", "unitPriceKopecks", "updatedAt", "userId") SELECT "collectionId", "createdAt", "id", "productId", "quantityDecimal", "unitPriceKopecks", "updatedAt", "userId" FROM "CartItem";
DROP TABLE "CartItem";
ALTER TABLE "new_CartItem" RENAME TO "CartItem";
CREATE UNIQUE INDEX "CartItem_userId_collectionId_productId_key" ON "CartItem"("userId", "collectionId", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PublicReview_rating_idx" ON "PublicReview"("rating");

-- CreateIndex
CREATE INDEX "PublicReview_createdAt_idx" ON "PublicReview"("createdAt");

-- CreateIndex
CREATE INDEX "PublicReviewImage_reviewId_idx" ON "PublicReviewImage"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
