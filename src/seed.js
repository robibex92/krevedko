import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Admin bootstrap (only if no users)
  const usersCount = await prisma.user.count();
  if (usersCount === 0) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: {
        email: "admin@example.com",
        passwordHash,
        role: "ADMIN",
        name: "Администратор",
      },
    });
    console.log("[seed] Created admin: admin@example.com / admin123");
  }

  // Collections bootstrap
  let active = await prisma.collection.findFirst({
    where: { status: "ACTIVE" },
  });
  if (!active) {
    const ends = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 days by default
    active = await prisma.collection.create({
      data: {
        title: "Активный сбор",
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: ends,
        notes: "Тестовый активный период",
      },
    });
    console.log("[seed] Created active collection:", active.id);
  }

  // Products bootstrap (if no products)
  const productsCount = await prisma.product.count();
  if (productsCount === 0) {
    const p1 = await prisma.product.create({
      data: {
        title: "Яблоки",
        description: "Свежие яблоки",
        category: "Фрукты",
        unitLabel: "кг",
        stepDecimal: "0.5",
        priceKopecks: 12000, // 120 ₽ за кг (цена за 1.0 юнит)
        isActive: true,
      },
    });
    const p2 = await prisma.product.create({
      data: {
        title: "Хлеб",
        description: "Буханка хлеба",
        category: "Выпечка",
        unitLabel: "шт",
        stepDecimal: "1",
        priceKopecks: 4500, // 45 ₽
        isActive: true,
      },
    });

    await prisma.collectionProduct.create({
      data: { collectionId: active.id, productId: p1.id, isActive: true },
    });
    await prisma.collectionProduct.create({
      data: { collectionId: active.id, productId: p2.id, isActive: true },
    });
    console.log(
      "[seed] Created products and linked to active collection:",
      p1.id,
      p2.id
    );
  }

  console.log("[seed] Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
