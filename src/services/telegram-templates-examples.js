/**
 * Примеры использования улучшенных шаблонов телеграм сообщений
 *
 * Этот файл содержит примеры того, как будут выглядеть новые шаблоны сообщений
 * и как их использовать в коде.
 */

import {
  buildProductMessage,
  buildQuickPickupMessage,
  buildDiscountedProductMessage,
  buildNewProductMessage,
  buildSmartProductMessage,
  buildSaleMessage,
  buildProductRemovedMessage,
  buildRecipeMessage,
  buildReviewMessage,
} from "./telegram-bot.js";

// Пример товара для тестирования
const sampleProduct = {
  id: 1,
  title: "Свежие помидоры черри",
  description:
    "Сладкие и сочные помидоры черри, выращенные в экологически чистых условиях. Идеально подходят для салатов и закусок.",
  category: "овощи",
  priceKopecks: 15000, // 150 рублей
  unitLabel: "кг",
  stockQuantity: "3",
  stepDecimal: "0.5",
  canPickupNow: true,
  tags: JSON.stringify(["органические", "свежие", "местные"]),
};

const sampleRecipe = {
  id: 1,
  title: "Салат с помидорами черри и моцареллой",
  excerpt:
    "Легкий и освежающий салат с нежным сыром моцарелла и сладкими помидорами черри.",
  slug: "salad-cherry-tomatoes-mozzarella",
  cookingTime: "15 минут",
  difficulty: "easy",
};

const sampleReview = {
  id: 1,
  title: "Отличные помидоры!",
  content:
    "Помидоры очень вкусные и свежие. Заказываю уже третий раз, качество стабильное.",
  rating: 5,
};

const sampleUser = {
  firstName: "Анна",
  lastName: "Петрова",
};

// Примеры использования шаблонов
export function getTemplateExamples() {
  return {
    // 1. Обычный товар
    regularProduct: buildProductMessage(sampleProduct),

    // 2. Товар для быстрой продажи
    quickPickup: buildQuickPickupMessage(sampleProduct),

    // 3. Товар со скидкой
    discountedProduct: buildDiscountedProductMessage(
      sampleProduct,
      20, // 20% скидка
      18750 // оригинальная цена 187.50 руб
    ),

    // 4. Новинка
    newProduct: buildNewProductMessage(sampleProduct),

    // 5. Умный выбор шаблона
    smartProduct: buildSmartProductMessage(sampleProduct, {
      isNew: true,
      isDiscounted: false,
      isQuickPickup: false,
    }),

    // 6. Распродажа
    sale: buildSaleMessage(
      [
        sampleProduct,
        { ...sampleProduct, title: "Огурцы свежие", category: "овощи" },
      ],
      "СУПЕР СКИДКИ НА ОВОЩИ!",
      "Скидки до 30% на все свежие овощи. Только сегодня!",
      new Date(Date.now() + 24 * 60 * 60 * 1000) // завтра
    ),

    // 7. Снятый с продажи товар
    removedProduct: buildProductRemovedMessage(
      buildProductMessage(sampleProduct)
    ),

    // 8. Рецепт
    recipe: buildRecipeMessage(sampleRecipe),

    // 9. Отзыв
    review: buildReviewMessage(sampleReview, sampleUser),
  };
}

// Функция для тестирования всех шаблонов
export function testAllTemplates() {
  const examples = getTemplateExamples();

  console.log("=== ПРИМЕРЫ ТЕЛЕГРАМ ШАБЛОНОВ ===\n");

  Object.entries(examples).forEach(([name, template]) => {
    console.log(`--- ${name.toUpperCase()} ---`);
    console.log(template);
    console.log("\n" + "=".repeat(50) + "\n");
  });
}

// Примеры использования в коде
export const usageExamples = {
  // Отправка обычного товара
  sendRegularProduct: `
    const messageText = buildProductMessage(product);
    await sendTelegramPhoto(chatId, product.imagePath, messageText);
  `,

  // Отправка товара со скидкой
  sendDiscountedProduct: `
    const messageText = buildDiscountedProductMessage(
      product, 
      25, // 25% скидка
      originalPrice
    );
    await sendTelegramPhoto(chatId, product.imagePath, messageText);
  `,

  // Умный выбор шаблона
  sendSmartProduct: `
    const messageText = buildSmartProductMessage(product, {
      isNew: product.isNewProduct,
      isDiscounted: product.hasDiscount,
      discountPercent: product.discountPercent,
      originalPrice: product.originalPrice,
      isQuickPickup: product.canPickupNow
    });
    await sendTelegramPhoto(chatId, product.imagePath, messageText);
  `,

  // Отправка распродажи
  sendSale: `
    const messageText = buildSaleMessage(
      saleProducts,
      "ЧЕРНАЯ ПЯТНИЦА!",
      "Скидки до 50% на все товары",
      saleEndDate
    );
    await sendTelegramMessage(chatId, messageText);
  `,
};

// Рекомендации по использованию
export const recommendations = {
  whenToUse: {
    regularProduct: "Для обычных товаров без специальных предложений",
    quickPickup: "Для товаров, которые можно забрать в день заказа",
    discountedProduct: "Для товаров со скидками и акциями",
    newProduct: "Для новых поступлений и новинок",
    smartProduct: "Для автоматического выбора подходящего шаблона",
    sale: "Для массовых акций и распродаж",
    removedProduct: "Для товаров, снятых с продажи",
    recipe: "Для публикации новых рецептов",
    review: "Для уведомлений о новых отзывах",
  },

  bestPractices: [
    "Используйте эмодзи для привлечения внимания",
    "Добавляйте призывы к действию в конце сообщения",
    "Указывайте ограниченность предложения (время, количество)",
    "Используйте разделители для структурирования информации",
    "Показывайте экономию при скидках",
    "Предупреждайте о малом количестве товара",
    "Добавляйте контактную информацию для заказов",
  ],

  emojiUsage: {
    categories: "Используйте соответствующие эмодзи для категорий товаров",
    urgency: "🔥 для срочных предложений, ⚡ для быстрых продаж",
    pricing: "💰 для цен, 💸 для старых цен, 🎉 для экономии",
    stock: "📦 для наличия, ⚠️ для малого количества, ❌ для отсутствия",
    actions: "🛒 для заказа, 💬 для связи, ⭐ для отзывов",
  },
};

// Экспорт для использования в других модулях
export default {
  getTemplateExamples,
  testAllTemplates,
  usageExamples,
  recommendations,
};
