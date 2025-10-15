import path from "path";
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramMediaGroup,
  editTelegramMessage,
  editTelegramMessageMedia,
  deleteTelegramMessage,
} from "./telegram.js";

const MESSAGE_EDIT_WINDOW = 48 * 60 * 60 * 1000; // 48 часов в миллисекундах

/**
 * Форматирование цены из копеек в рубли
 */
function formatPrice(kopecks) {
  const rubles = (kopecks / 100).toFixed(2);
  return `${rubles} ₽`;
}

/**
 * Получение эмодзи для категории товара
 */
function getCategoryEmoji(category) {
  if (!category) return "🛍️";

  const categoryEmojis = {
    овощи: "🥕",
    фрукты: "🍎",
    мясо: "🥩",
    рыба: "🐟",
    молочные: "🥛",
    хлеб: "🍞",
    крупы: "🌾",
    масла: "🫒",
    специи: "🌶️",
    напитки: "🥤",
    сладости: "🍬",
    заморозка: "🧊",
    консервы: "🥫",
    детское: "👶",
    здоровое: "🥗",
    веганское: "🌱",
    "без глютена": "🌾",
    органическое: "🌿",
    местное: "🏠",
    сезонное: "🍂",
    премиум: "💎",
    акция: "🔥",
    новинка: "✨",
  };

  const lowerCategory = category.toLowerCase();

  // Ищем точное совпадение
  if (categoryEmojis[lowerCategory]) {
    return categoryEmojis[lowerCategory];
  }

  // Ищем частичное совпадение
  for (const [key, emoji] of Object.entries(categoryEmojis)) {
    if (lowerCategory.includes(key) || key.includes(lowerCategory)) {
      return emoji;
    }
  }

  return "🛍️"; // Дефолтный эмодзи
}

function resolveProductImageSource(imagePath) {
  if (!imagePath) return { url: null, filePath: null };
  if (/^https?:\/\//i.test(imagePath)) {
    return { url: imagePath, filePath: null };
  }

  const normalized = imagePath.replace(/^\/+/, "");
  const trimmed = normalized.startsWith("uploads/")
    ? normalized.slice("uploads/".length)
    : normalized;

  let baseUrl = process.env.UPLOADS_BASE_URL || null;
  if (!baseUrl && process.env.API_URL) {
    baseUrl = `${process.env.API_URL.replace(/\/$/, "")}/uploads`;
  }
  baseUrl = baseUrl ? baseUrl.replace(/\/$/, "") : null;

  const url = baseUrl ? `${baseUrl}/${trimmed}` : null;
  const filePath = path.join(process.cwd(), "uploads", trimmed);

  return { url, filePath };
}

/**
 * Создание текста сообщения для товара
 */
export function buildProductMessage(product) {
  const lines = [];

  // Заголовок товара
  lines.push(`🏷️<b>${product.title}</b>`);

  // Описание товара (только если есть)
  if (product.description) {
    lines.push("");
    lines.push(`📝${product.description}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Цена
  lines.push(
    `💰 Цена: <b>${formatPrice(product.priceKopecks)}</b> за ${product.unitLabel}`
  );

  return lines.join("\n");
}

/**
 * Создание текста сообщения для снятого с продажи товара
 */
export function buildProductRemovedMessage(originalText) {
  const lines = originalText.split("\n").map((line) => {
    // Не зачеркиваем разделитель
    if (line === "━━━━━━━━━━━━━━━━━━━━") {
      return line;
    }
    return `<s>${line}</s>`;
  });
  lines.push("");
  lines.push("⛔️ <b>СНЯТО С ПРОДАЖИ</b>");
  return lines.join("\n");
}

/**
 * Создание текста сообщения для товара со скидкой
 */
export function buildDiscountedProductMessage(
  product,
  discountPercent,
  originalPrice
) {
  const lines = [];

  // Заголовок с акцентом на скидку
  lines.push(`🔥 <b>СКИДКА ${discountPercent}%!</b> 🔥`);
  lines.push("");

  // Заголовок товара с эмодзи категории
  const categoryEmoji = getCategoryEmoji(product.category);
  lines.push(`${categoryEmoji} <b>${product.title}</b>`);

  // Категория товара
  if (product.category) {
    lines.push(`🏷️ <i>${product.category}</i>`);
  }

  // Описание товара
  if (product.description) {
    lines.push("");
    lines.push(`📝 ${product.description}`);
  }

  // Теги товара
  if (product.tags) {
    try {
      const tags = JSON.parse(product.tags);
      if (Array.isArray(tags) && tags.length > 0) {
        lines.push("");
        lines.push(`🏷️ <i>${tags.join(" • ")}</i>`);
      }
    } catch (e) {
      // Игнорируем ошибки парсинга тегов
    }
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Цены со скидкой
  lines.push(
    `💰 <b>${formatPrice(product.priceKopecks)}</b> за ${product.unitLabel}`
  );
  lines.push(`💸 <s>Было: ${formatPrice(originalPrice)}</s>`);
  lines.push(
    `🎉 <b>Экономия: ${formatPrice(originalPrice - product.priceKopecks)}</b>`
  );

  // Информация о наличии
  if (product.stockQuantity && parseFloat(product.stockQuantity) > 0) {
    const stockQty = parseFloat(product.stockQuantity);
    const stockEmoji = stockQty > 10 ? "📦" : stockQty > 5 ? "📦" : "⚠️";
    lines.push(
      `${stockEmoji} В наличии: <b>${product.stockQuantity} ${product.unitLabel}</b>`
    );

    // Предупреждение о малом количестве
    if (stockQty <= 5) {
      lines.push(`🔥 <i>Осталось мало! Успейте заказать</i>`);
    }
  } else {
    lines.push(`❌ Нет в наличии`);
  }

  // Возможность забрать сегодня
  if (product.canPickupNow) {
    lines.push(`⚡ <b>Можно забрать сегодня!</b>`);
  }

  // Минимальный заказ
  if (product.stepDecimal && parseFloat(product.stepDecimal) > 0) {
    lines.push(`📏 Мин. заказ: ${product.stepDecimal} ${product.unitLabel}`);
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Призыв к действию
  lines.push(`🛒 <b>Заказать со скидкой!</b>`);
  lines.push(`⏰ <i>Предложение ограничено по времени</i>`);
  lines.push(`💬 <i>Напишите в личные сообщения для заказа</i>`);

  return lines.join("\n");
}

/**
 * Создание текста сообщения для товара "Можно забрать сейчас"
 */
export function buildQuickPickupMessage(product) {
  const lines = [];

  // Заголовок товара
  lines.push(`🏷️<b>${product.title}</b>`);

  // Описание товара (только если есть)
  if (product.description) {
    lines.push("");
    lines.push(`📝${product.description}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Цена
  lines.push(
    `💰 Цена: <b>${formatPrice(product.priceKopecks)}</b> за ${product.unitLabel}`
  );

  // Возможность забрать сегодня
  lines.push(`⚡ <b>Можно забрать сегодня!</b>`);

  return lines.join("\n");
}

/**
 * Создание текста сообщения для отзыва
 */
export function buildReviewMessage(review, user) {
  const lines = [];

  // Показываем только звезды без "Новый отзыв"
  const stars = "⭐".repeat(review.rating);
  lines.push(stars);
  lines.push("");

  // Заголовок сразу под звездами
  if (review.title) {
    // Используем HTML для жирного текста
    lines.push(`<b>${review.title}</b>`);
    lines.push("");
  }

  // Сначала текст отзыва
  lines.push(review.content);
  lines.push("");

  // Приоритет: telegramUsername > firstName > lastName > name > email

  let userName = "Клиент";
  if (user.telegramUsername && user.telegramUsername.trim()) {
    userName = `@${user.telegramUsername}`;
  } else if (user.firstName && user.firstName.trim()) {
    userName = user.firstName;
  } else if (user.lastName && user.lastName.trim()) {
    userName = user.lastName;
  } else if (user.name && user.name.trim()) {
    userName = user.name;
  } else if (user.email && user.email.trim()) {
    userName = user.email;
  }

  lines.push(`Отзыв от: ${userName}`);

  return lines.join("\n");
}

/**
 * Создание текста сообщения для рецепта
 */
export function buildRecipeMessage(recipe) {
  const lines = [];

  lines.push(`🍳 <b>НОВЫЙ РЕЦЕПТ!</b> 🍳`);
  lines.push("");
  lines.push(`<b>${recipe.title}</b>`);

  if (recipe.excerpt) {
    lines.push("");
    lines.push(`📝 ${recipe.excerpt}`);
  }

  // Время приготовления и сложность
  if (recipe.cookingTime) {
    lines.push("");
    lines.push(`⏱️ Время приготовления: ${recipe.cookingTime}`);
  }

  if (recipe.difficulty) {
    const difficultyEmojis = {
      easy: "🟢 Легко",
      medium: "🟡 Средне",
      hard: "🔴 Сложно",
    };
    lines.push(
      `🎯 Сложность: ${difficultyEmojis[recipe.difficulty] || recipe.difficulty}`
    );
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Ссылка на рецепт
  const recipeUrl = `${process.env.FRONTEND_URL || ""}/recipes/${recipe.slug}`;
  lines.push(`📖 <a href="${recipeUrl}"><b>Читать полный рецепт →</b></a>`);
  lines.push(`💬 <i>Делитесь результатами в комментариях!</i>`);

  return lines.join("\n");
}

/**
 * Создание текста сообщения для новинки
 */
export function buildNewProductMessage(product) {
  const lines = [];

  // Заголовок с акцентом на новинку
  lines.push(`✨ <b>НОВИНКА!</b> ✨`);
  lines.push("");

  // Заголовок товара с эмодзи категории
  const categoryEmoji = getCategoryEmoji(product.category);
  lines.push(`${categoryEmoji} <b>${product.title}</b>`);

  // Категория товара
  if (product.category) {
    lines.push(`🏷️ <i>${product.category}</i>`);
  }

  // Описание товара
  if (product.description) {
    lines.push("");
    lines.push(`📝 ${product.description}`);
  }

  // Теги товара
  if (product.tags) {
    try {
      const tags = JSON.parse(product.tags);
      if (Array.isArray(tags) && tags.length > 0) {
        lines.push("");
        lines.push(`🏷️ <i>${tags.join(" • ")}</i>`);
      }
    } catch (e) {
      // Игнорируем ошибки парсинга тегов
    }
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Цена с акцентом
  lines.push(
    `💰 <b>${formatPrice(product.priceKopecks)}</b> за ${product.unitLabel}`
  );

  // Информация о наличии
  if (product.stockQuantity && parseFloat(product.stockQuantity) > 0) {
    const stockQty = parseFloat(product.stockQuantity);
    const stockEmoji = stockQty > 10 ? "📦" : stockQty > 5 ? "📦" : "⚠️";
    lines.push(
      `${stockEmoji} В наличии: <b>${product.stockQuantity} ${product.unitLabel}</b>`
    );
  } else {
    lines.push(`❌ Нет в наличии`);
  }

  // Возможность забрать сегодня
  if (product.canPickupNow) {
    lines.push(`⚡ <b>Можно забрать сегодня!</b>`);
  }

  // Минимальный заказ
  if (product.stepDecimal && parseFloat(product.stepDecimal) > 0) {
    lines.push(`📏 Мин. заказ: ${product.stepDecimal} ${product.unitLabel}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");

  // Призыв к действию
  lines.push(`🛒 <b>Попробовать новинку!</b>`);
  lines.push(`💬 <i>Напишите в личные сообщения для заказа</i>`);
  lines.push(`⭐ <i>Оставьте отзыв после покупки</i>`);

  return lines.join("\n");
}

/**
 * Автоматический выбор подходящего шаблона сообщения для товара
 */
export function buildSmartProductMessage(product, options = {}) {
  const {
    isNew = false,
    isDiscounted = false,
    discountPercent = 0,
    originalPrice = null,
    isQuickPickup = false,
  } = options;

  // Приоритет: быстрая продажа > скидка > новинка > обычный товар
  if (isQuickPickup || product.canPickupNow) {
    return buildQuickPickupMessage(product);
  }

  if (isDiscounted && discountPercent > 0 && originalPrice) {
    return buildDiscountedProductMessage(
      product,
      discountPercent,
      originalPrice
    );
  }

  if (isNew) {
    return buildNewProductMessage(product);
  }

  return buildProductMessage(product);
}

/**
 * Создание сообщения о распродаже/акции
 */
export function buildSaleMessage(
  products,
  saleTitle,
  saleDescription,
  endDate
) {
  const lines = [];

  lines.push(`🔥 <b>${saleTitle}</b> 🔥`);
  lines.push("");

  if (saleDescription) {
    lines.push(`📝 ${saleDescription}`);
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("<b>🎯 Товары по акции:</b>");
  lines.push("");

  products.forEach((product, index) => {
    const categoryEmoji = getCategoryEmoji(product.category);
    lines.push(`${index + 1}. ${categoryEmoji} <b>${product.title}</b>`);
    lines.push(
      `   💰 ${formatPrice(product.priceKopecks)} за ${product.unitLabel}`
    );

    if (product.stockQuantity && parseFloat(product.stockQuantity) > 0) {
      lines.push(
        `   📦 В наличии: ${product.stockQuantity} ${product.unitLabel}`
      );
    }
    lines.push("");
  });

  lines.push("━━━━━━━━━━━━━━━━━━━━");

  if (endDate) {
    const endDateStr = new Date(endDate).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    lines.push(`⏰ <b>Акция действует до: ${endDateStr}</b>`);
    lines.push("");
  }

  lines.push(`🛒 <b>Заказать товары по акции!</b>`);
  lines.push(`💬 <i>Напишите в личные сообщения</i>`);

  return lines.join("\n");
}

/**
 * Редактирование текста/caption сообщения в зависимости от типа
 */
async function editMessageTextOrCaption(
  chatId,
  messageId,
  text,
  hasMedia,
  mediaType
) {
  if (hasMedia && mediaType === "photo") {
    // Редактируем caption для фото
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const editCaptionUrl = `https://api.telegram.org/bot${token}/editMessageCaption`;

    const response = await fetch(editCaptionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption: text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (
        errorText.includes("message can't be edited") ||
        errorText.includes("message to edit not found")
      ) {
        throw new Error("MESSAGE_TOO_OLD");
      }
      throw new Error(`Failed to edit caption: ${response.status}`);
    }
  } else {
    // Редактируем обычное текстовое сообщение
    await editTelegramMessage(chatId, messageId, text);
  }
}

/**
 * Отправка сообщения о товаре в чат категории
 */
export async function sendProductToCategory(prisma, product, category) {
  try {
    const messageText = buildProductMessage(product);
    const chatId = category.telegramChatId;
    const threadId = category.telegramThreadId || null;

    let result;
    let hasMedia = false;
    let mediaType = null;

    // Если есть изображение, отправляем с фото
    if (product.imagePath) {
      const { url: photoUrl, filePath } = resolveProductImageSource(
        product.imagePath
      );
      const photoSource = photoUrl || filePath;

      if (photoSource) {
        try {
          result = await sendTelegramPhoto(chatId, photoSource, messageText, {
            threadId,
          });
          hasMedia = true;
          mediaType = "photo";
        } catch (error) {
          console.error(
            `Failed to send photo for product ${product.id}:`,
            error
          );
          // Если не удалось отправить фото, отправляем текст
          result = await sendTelegramMessage(chatId, messageText, {
            threadId,
            parse_mode: "HTML",
          });
        }
      } else {
        result = await sendTelegramMessage(chatId, messageText, {
          threadId,
          parse_mode: "HTML",
        });
      }
    } else {
      result = await sendTelegramMessage(chatId, messageText, {
        threadId,
        parse_mode: "HTML",
      });
    }

    // Сохраняем информацию о сообщении
    const messageRecord = await prisma.productTelegramMessage.create({
      data: {
        productId: product.id,
        categoryId: category.id,
        messageId: String(result.result.message_id),
        messageText,
        hasMedia,
        mediaType,
        canEdit: true,
      },
    });

    return messageRecord;
  } catch (error) {
    console.error(
      `Failed to send product ${product.id} to category ${category.id}:`,
      error
    );
    throw error;
  }
}

/**
 * Обновление сообщения о товаре
 */
export async function updateProductMessage(prisma, product, categoryId) {
  try {
    const messageRecord = await prisma.productTelegramMessage.findUnique({
      where: {
        productId_categoryId: {
          productId: product.id,
          categoryId: categoryId,
        },
      },
      include: {
        category: true,
      },
    });

    if (!messageRecord) {
      console.warn(
        `No message record found for product ${product.id} in category ${categoryId}`
      );
      return null;
    }

    // Если товар неактивен, не обновляем - он должен быть помечен как удаленный через product_remove
    if (!product.isActive) {
      console.log(`Product ${product.id} is inactive, skipping update`);
      return null;
    }

    const newMessageText = buildProductMessage(product);
    const chatId = messageRecord.category.telegramChatId;
    const messageId = messageRecord.messageId;

    // Проверяем, можно ли редактировать сообщение (не прошло 48 часов)
    const messageAge = Date.now() - messageRecord.sentAt.getTime();
    const canEdit = messageAge < MESSAGE_EDIT_WINDOW && messageRecord.canEdit;

    if (!canEdit) {
      // Удаляем старое и создаем новое
      await deleteTelegramMessage(chatId, messageId);
      await prisma.productTelegramMessage.delete({
        where: { id: messageRecord.id },
      });
      return await sendProductToCategory(
        prisma,
        product,
        messageRecord.category
      );
    }

    try {
      // Проверяем изменение медиа
      const hasNewImage = !!product.imagePath;
      const hadImage = messageRecord.hasMedia;

      const { url: newPhotoUrl, filePath: newPhotoPath } =
        resolveProductImageSource(product.imagePath);
      const newPhotoSource = newPhotoUrl || newPhotoPath;

      if (hasNewImage && hadImage) {
        if (newPhotoSource) {
          // Обновляем фото и текст
          await editTelegramMessageMedia(
            chatId,
            messageId,
            newPhotoSource,
            newMessageText
          );
        } else {
          // Нет доступного медиа — обновляем только caption/текст
          await editMessageTextOrCaption(
            chatId,
            messageId,
            newMessageText,
            hadImage,
            messageRecord.mediaType
          );
        }
      } else if (hasNewImage && !hadImage) {
        // Было текстовое, стало с фото - удаляем старое, создаем новое
        await deleteTelegramMessage(chatId, messageId);
        await prisma.productTelegramMessage.delete({
          where: { id: messageRecord.id },
        });
        return await sendProductToCategory(
          prisma,
          product,
          messageRecord.category
        );
      } else {
        // Обновляем только текст/caption
        await editMessageTextOrCaption(
          chatId,
          messageId,
          newMessageText,
          hadImage,
          messageRecord.mediaType
        );
      }

      // Обновляем запись в БД
      const updated = await prisma.productTelegramMessage.update({
        where: { id: messageRecord.id },
        data: {
          messageText: newMessageText,
          lastEditedAt: new Date(),
          hasMedia: Boolean(newPhotoSource),
          mediaType: newPhotoSource ? "photo" : null,
        },
      });

      return updated;
    } catch (error) {
      if (error.message === "MESSAGE_TOO_OLD") {
        // Удаляем старое и создаем новое
        await deleteTelegramMessage(chatId, messageId);
        await prisma.productTelegramMessage.delete({
          where: { id: messageRecord.id },
        });
        return await sendProductToCategory(
          prisma,
          product,
          messageRecord.category
        );
      }
      throw error;
    }
  } catch (error) {
    console.error(
      `Failed to update product message ${product.id} in category ${categoryId}:`,
      error
    );
    throw error;
  }
}

/**
 * Отметка товара как снятого с продажи
 */
export async function markProductAsRemoved(prisma, productId) {
  try {
    const messages = await prisma.productTelegramMessage.findMany({
      where: { productId },
      include: { category: true },
    });

    for (const messageRecord of messages) {
      const removedText = buildProductRemovedMessage(messageRecord.messageText);
      const chatId = messageRecord.category.telegramChatId;
      const messageId = messageRecord.messageId;

      const messageAge = Date.now() - messageRecord.sentAt.getTime();
      const canEdit = messageAge < MESSAGE_EDIT_WINDOW && messageRecord.canEdit;

      if (canEdit) {
        try {
          // Используем универсальную функцию для редактирования
          await editMessageTextOrCaption(
            chatId,
            messageId,
            removedText,
            messageRecord.hasMedia,
            messageRecord.mediaType
          );

          await prisma.productTelegramMessage.update({
            where: { id: messageRecord.id },
            data: {
              messageText: removedText,
              lastEditedAt: new Date(),
              canEdit: false,
            },
          });
        } catch (error) {
          if (error.message === "MESSAGE_TOO_OLD") {
            // Удаляем старое и создаем новое с зачеркнутым текстом
            await deleteTelegramMessage(chatId, messageId);
            await sendTelegramMessage(chatId, removedText, {
              threadId: messageRecord.category.telegramThreadId,
            });
            await prisma.productTelegramMessage.update({
              where: { id: messageRecord.id },
              data: {
                messageText: removedText,
                lastEditedAt: new Date(),
                canEdit: false,
              },
            });
          } else {
            throw error;
          }
        }
      }
    }

    // Также удаляем из чата быстрых продаж если был там
    await removeProductFromQuickPickup(prisma, productId);
  } catch (error) {
    console.error(`Failed to mark product ${productId} as removed:`, error);
    throw error;
  }
}

/**
 * Добавление товара в чат быстрых продаж (можно забрать сейчас)
 */
export async function addProductToQuickPickup(prisma, product) {
  try {
    // Проверяем, есть ли настройки для чата быстрых продаж
    const settings = await prisma.telegramSettings.findUnique({
      where: { key: "quick_pickup_chat" },
    });

    if (!settings || !settings.chatId) {
      console.warn("Quick pickup chat not configured");
      return null;
    }

    // Проверяем, есть ли уже сообщение
    const existing = await prisma.inStockTelegramMessage.findUnique({
      where: { productId: product.id },
    });

    if (existing) {
      console.log(`Product ${product.id} already in quick pickup chat`);
      return existing;
    }

    const messageText = buildQuickPickupMessage(product);
    let result;
    let hasMedia = false;

    if (product.imagePath) {
      const imagePath = path.join(process.cwd(), "uploads", product.imagePath);
      try {
        result = await sendTelegramPhoto(
          settings.chatId,
          imagePath,
          messageText,
          { threadId: settings.threadId }
        );
        hasMedia = true;
      } catch (error) {
        console.error(
          `Failed to send photo for quick pickup product ${product.id}:`,
          error
        );
        result = await sendTelegramMessage(settings.chatId, messageText, {
          threadId: settings.threadId,
          parse_mode: "HTML",
        });
      }
    } else {
      result = await sendTelegramMessage(settings.chatId, messageText, {
        threadId: settings.threadId,
        parse_mode: "HTML",
      });
    }

    const messageRecord = await prisma.inStockTelegramMessage.create({
      data: {
        productId: product.id,
        messageId: String(result.result.message_id),
        messageText,
        hasMedia,
      },
    });

    return messageRecord;
  } catch (error) {
    console.error(
      `Failed to add product ${product.id} to quick pickup chat:`,
      error
    );
    throw error;
  }
}

/**
 * Удаление товара из чата быстрых продаж
 */
export async function removeProductFromQuickPickup(prisma, productId) {
  try {
    const messageRecord = await prisma.inStockTelegramMessage.findUnique({
      where: { productId },
    });

    if (!messageRecord) {
      return;
    }

    const settings = await prisma.telegramSettings.findUnique({
      where: { key: "quick_pickup_chat" },
    });

    if (settings && settings.chatId) {
      await deleteTelegramMessage(settings.chatId, messageRecord.messageId);
    }

    await prisma.inStockTelegramMessage.delete({
      where: { productId },
    });
  } catch (error) {
    console.error(
      `Failed to remove product ${productId} from quick pickup chat:`,
      error
    );
    // Не бросаем ошибку, так как это не критично
  }
}

/**
 * Отправка отзыва в чат отзывов
 */
export async function sendReviewToChat(prisma, review, user) {
  try {
    const settings = await prisma.telegramSettings.findUnique({
      where: { key: "reviews_chat" },
    });

    if (!settings || !settings.chatId) {
      console.warn("Reviews chat not configured");
      return;
    }

    const messageText = buildReviewMessage(review, user);

    // Загружаем изображения отзыва
    const images = await prisma.publicReviewImage.findMany({
      where: { reviewId: review.id },
    });

    if (images.length === 0) {
      // Только текст
      await sendTelegramMessage(settings.chatId, messageText, {
        threadId: settings.threadId,
        parse_mode: "HTML",
      });
    } else if (images.length === 1) {
      // Одно изображение
      const imagePath = path.join(
        process.cwd(),
        "uploads",
        images[0].imagePath
      );
      await sendTelegramPhoto(settings.chatId, imagePath, messageText, {
        threadId: settings.threadId,
        parse_mode: "HTML",
      });
    } else {
      // Несколько изображений - отправляем как медиа-группу
      const mediaGroup = images.map((image, index) => {
        const imagePath = path.join(process.cwd(), "uploads", image.imagePath);
        return {
          type: "photo",
          media: { source: imagePath },
          caption: index === 0 ? messageText : undefined, // Текст только к первому изображению
        };
      });

      try {
        await sendTelegramMediaGroup(settings.chatId, mediaGroup, {
          threadId: settings.threadId,
          parse_mode: "HTML",
        });
      } catch (mediaGroupError) {
        console.warn(
          "Media group failed, sending individually:",
          mediaGroupError
        );
        // Fallback: отправляем текст + изображения по одному
        await sendTelegramMessage(settings.chatId, messageText, {
          threadId: settings.threadId,
          parse_mode: "HTML",
        });
        for (const image of images) {
          const imagePath = path.join(
            process.cwd(),
            "uploads",
            image.imagePath
          );
          await sendTelegramPhoto(settings.chatId, imagePath, "", {
            threadId: settings.threadId,
            parse_mode: "HTML",
          });
        }
      }
    }
  } catch (error) {
    console.error(`Failed to send review ${review.id} to chat:`, error);
    // Не бросаем ошибку, так как отзыв уже создан
  }
}

/**
 * Отправка рецепта в чат рецептов
 */
export async function sendRecipeToChat(prisma, recipe) {
  try {
    const settings = await prisma.telegramSettings.findUnique({
      where: { key: "recipes_chat" },
    });

    if (!settings || !settings.chatId) {
      console.warn("Recipes chat not configured");
      return;
    }

    const messageText = buildRecipeMessage(recipe);

    await sendTelegramMessage(settings.chatId, messageText, {
      threadId: settings.threadId,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(`Failed to send recipe ${recipe.id} to chat:`, error);
    // Не бросаем ошибку, так как рецепт уже создан
  }
}

/**
 * Отправка уведомления о новом заказе админу
 */
export async function sendOrderNotificationToAdmin(prisma, order, user) {
  try {
    const adminChatId = process.env.ADMIN_TELEGRAM_ID;

    if (!adminChatId) {
      console.warn("ADMIN_TELEGRAM_ID not configured");
      return;
    }

    // Получаем полную информацию о заказе с товарами
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: true,
        collection: true,
      },
    });

    if (!fullOrder) {
      console.warn(`Order ${order.id} not found for notification`);
      return;
    }

    const lines = [];
    const versionSuffix =
      fullOrder.editVersion > 1 ? `_v${fullOrder.editVersion}` : "";
    const isUpdate = fullOrder.editVersion > 1;

    lines.push(
      isUpdate ? "<b>📝 Заказ изменен!</b>" : "<b>🛒 Новый заказ на сайте!</b>"
    );
    lines.push("");
    lines.push(
      `📋 Номер заказа: <b>${fullOrder.orderNumber || `ORD-${fullOrder.id}`}${versionSuffix}</b>`
    );

    // Информация о клиенте
    if (user || fullOrder.user) {
      const orderUser = user || fullOrder.user;
      const fullName =
        [orderUser.firstName, orderUser.lastName].filter(Boolean).join(" ") ||
        orderUser.name ||
        "Клиент";
      lines.push(`👤 От: ${fullName}`);

      if (orderUser.telegramUsername) {
        lines.push(`📱 Telegram: @${orderUser.telegramUsername}`);
      } else if (orderUser.email) {
        lines.push(`📧 Email: ${orderUser.email}`);
      } else if (orderUser.phone) {
        lines.push(`📞 Телефон: ${orderUser.phone}`);
      }
    } else if (fullOrder.isGuestOrder) {
      lines.push(`👤 Гостевой заказ`);
      if (fullOrder.guestName) {
        lines.push(`   Имя: ${fullOrder.guestName}`);
      }
      if (fullOrder.guestPhone) {
        lines.push(`   📞 ${fullOrder.guestPhone}`);
      }
      if (fullOrder.guestEmail) {
        lines.push(`   📧 ${fullOrder.guestEmail}`);
      }
      if (fullOrder.guestContactInfo) {
        lines.push(`   💬 ${fullOrder.guestContactInfo}`);
      }
    }

    // Период
    if (fullOrder.collection?.title) {
      lines.push(`📅 Период: ${fullOrder.collection.title}`);
    }

    // Доставка
    lines.push("");
    if (fullOrder.deliveryType === "DELIVERY") {
      lines.push(`🚚 Доставка`);
      if (fullOrder.deliveryAddress) {
        lines.push(`   📍 ${fullOrder.deliveryAddress}`);
      }
    } else {
      lines.push(`🏪 Самовывоз`);
    }

    // Товары в заказе
    lines.push("");
    lines.push("<b>📦 Состав заказа:</b>");

    (fullOrder.items || []).forEach((item, index) => {
      const title = item.titleSnapshot || item.product?.title || "Товар";
      const qty = item.quantityDecimal || item.quantity || 0;
      const unit = item.unitLabelSnapshot || item.product?.unitLabel || "шт";
      const price = formatPrice(item.subtotalKopecks || 0);

      lines.push(`${index + 1}. ${title}`);
      lines.push(
        `   ${qty} ${unit} × ${formatPrice(item.unitPriceKopecks || 0)} = ${price}`
      );
    });

    // Итого
    lines.push("");
    lines.push(`💰 <b>ИТОГО: ${formatPrice(fullOrder.totalKopecks)}</b>`);

    // Дата заказа
    const orderDate = new Date(fullOrder.createdAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`🕐 ${orderDate}`);

    const messageText = lines.join("\n");

    await sendTelegramMessage(adminChatId, messageText, { parse_mode: "HTML" });
  } catch (error) {
    console.error(
      `Failed to send order ${order.id} notification to admin:`,
      error
    );
    // Не бросаем ошибку, так как заказ уже создан
  }
}

/**
 * Обработка очереди сообщений
 */
export async function processMessageQueue(prisma) {
  try {
    const now = new Date();
    const messages = await prisma.telegramMessageQueue.findMany({
      where: {
        status: "PENDING",
        scheduledFor: { lte: now },
        attempts: { lt: prisma.telegramMessageQueue.fields.maxAttempts },
      },
      orderBy: { scheduledFor: "asc" },
      take: 10, // Обрабатываем по 10 сообщений за раз
    });

    for (const message of messages) {
      await prisma.telegramMessageQueue.update({
        where: { id: message.id },
        data: { status: "PROCESSING" },
      });

      try {
        const payload = message.payload;

        switch (message.messageType) {
          case "product_create":
            {
              const product = await prisma.product.findUnique({
                where: { id: payload.productId },
              });
              const category = await prisma.category.findUnique({
                where: { id: payload.categoryId },
              });
              if (product && category) {
                await sendProductToCategory(prisma, product, category);
              }
            }
            break;

          case "product_update":
            {
              const product = await prisma.product.findUnique({
                where: { id: payload.productId },
              });
              if (product) {
                await updateProductMessage(prisma, product, payload.categoryId);
              }
            }
            break;

          case "product_remove":
            await markProductAsRemoved(prisma, payload.productId);
            break;

          case "quick_pickup_add":
            {
              const product = await prisma.product.findUnique({
                where: { id: payload.productId },
              });
              if (product && product.canPickupNow) {
                await addProductToQuickPickup(prisma, product);
              }
            }
            break;

          case "quick_pickup_remove":
            await removeProductFromQuickPickup(prisma, payload.productId);
            break;

          case "review":
            {
              const review = await prisma.publicReview.findUnique({
                where: { id: payload.reviewId },
                include: { user: true },
              });
              if (review) {
                await sendReviewToChat(prisma, review, review.user);
              }
            }
            break;

          case "recipe":
            {
              const recipe = await prisma.recipe.findUnique({
                where: { id: payload.recipeId },
              });
              if (recipe && recipe.status === "PUBLISHED") {
                await sendRecipeToChat(prisma, recipe);
              }
            }
            break;

          case "order_notification":
          case "order_update":
            {
              const order = await prisma.order.findUnique({
                where: { id: payload.orderId },
                include: { user: true },
              });
              if (order) {
                await sendOrderNotificationToAdmin(prisma, order, order.user);
              }
            }
            break;
        }

        await prisma.telegramMessageQueue.update({
          where: { id: message.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`Failed to process message ${message.id}:`, error);

        const newAttempts = message.attempts + 1;
        const isFailed = newAttempts >= message.maxAttempts;

        await prisma.telegramMessageQueue.update({
          where: { id: message.id },
          data: {
            status: isFailed ? "FAILED" : "PENDING",
            attempts: newAttempts,
            error: error.message,
            // Повторная попытка через 5 минут
            scheduledFor: isFailed
              ? message.scheduledFor
              : new Date(Date.now() + 5 * 60 * 1000),
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to process message queue:", error);
  }
}

/**
 * Добавление задачи в очередь
 */
export async function enqueueMessage(
  prisma,
  messageType,
  payload,
  scheduledFor = new Date()
) {
  return await prisma.telegramMessageQueue.create({
    data: {
      messageType,
      payload,
      scheduledFor,
    },
  });
}
