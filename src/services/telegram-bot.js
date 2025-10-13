import path from "path";
import {
  sendTelegramMessage,
  sendTelegramPhoto,
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

  lines.push(`<b>${product.title}</b>`);

  if (product.description) {
    lines.push("");
    lines.push(product.description);
  }

  lines.push("");
  lines.push(
    `💰 Цена: <b>${formatPrice(product.priceKopecks)}</b> за ${product.unitLabel}`
  );

  if (product.stockQuantity && parseFloat(product.stockQuantity) > 0) {
    lines.push(`📦 В наличии: ${product.stockQuantity} ${product.unitLabel}`);
  }

  if (product.canPickupNow) {
    lines.push(`✅ Можно забрать сегодня`);
  }

  return lines.join("\n");
}

/**
 * Создание текста сообщения для снятого с продажи товара
 */
export function buildProductRemovedMessage(originalText) {
  const lines = originalText.split("\n").map((line) => `<s>${line}</s>`);
  lines.push("");
  lines.push("<b>⛔️ СНЯТО С ПРОДАЖИ</b>");
  return lines.join("\n");
}

/**
 * Создание текста сообщения для товара "Можно забрать сейчас"
 */
export function buildQuickPickupMessage(product) {
  const lines = [];

  lines.push(`<b>⚡ МОЖНО ЗАБРАТЬ СЕЙЧАС!</b>`);
  lines.push("");
  lines.push(`<b>${product.title}</b>`);
  lines.push(`💰 ${formatPrice(product.priceKopecks)} за ${product.unitLabel}`);

  if (product.description) {
    lines.push("");
    lines.push(product.description);
  }

  return lines.join("\n");
}

/**
 * Создание текста сообщения для отзыва
 */
export function buildReviewMessage(review, user) {
  const lines = [];

  const stars = "⭐".repeat(review.rating);
  lines.push(`<b>Новый отзыв</b> ${stars}`);
  lines.push("");

  const userName = user.firstName || user.name || "Клиент";
  lines.push(`От: ${userName}`);
  lines.push("");

  if (review.title) {
    lines.push(`<b>${review.title}</b>`);
    lines.push("");
  }

  lines.push(review.content);

  return lines.join("\n");
}

/**
 * Создание текста сообщения для рецепта
 */
export function buildRecipeMessage(recipe) {
  const lines = [];

  lines.push(`<b>🍳 Новый рецепт!</b>`);
  lines.push("");
  lines.push(`<b>${recipe.title}</b>`);

  if (recipe.excerpt) {
    lines.push("");
    lines.push(recipe.excerpt);
  }

  // Предполагаем, что URL будет в формате https://your-domain.com/recipes/slug
  const recipeUrl = `${process.env.FRONTEND_URL || ""}/recipes/${recipe.slug}`;
  lines.push("");
  lines.push(`<a href="${recipeUrl}">Читать рецепт →</a>`);

  return lines.join("\n");
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
          result = await sendTelegramMessage(chatId, messageText, { threadId });
        }
      } else {
        result = await sendTelegramMessage(chatId, messageText, { threadId });
      }
    } else {
      result = await sendTelegramMessage(chatId, messageText, { threadId });
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
          // Нет доступного медиа — обновляем только текст
          await editTelegramMessage(chatId, messageId, newMessageText);
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
        // Обновляем только текст
        await editTelegramMessage(chatId, messageId, newMessageText);
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

    console.log(
      `[markProductAsRemoved] Found ${messages.length} messages for product ${productId}`
    );

    for (const messageRecord of messages) {
      const removedText = buildProductRemovedMessage(messageRecord.messageText);
      const chatId = messageRecord.category.telegramChatId;
      const messageId = messageRecord.messageId;

      const messageAge = Date.now() - messageRecord.sentAt.getTime();
      const canEdit = messageAge < MESSAGE_EDIT_WINDOW && messageRecord.canEdit;

      if (canEdit) {
        try {
          await editTelegramMessage(chatId, messageId, removedText);
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

    // Удаляем из чата товаров в наличии
    await removeProductFromInStock(prisma, productId);
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
        });
      }
    } else {
      result = await sendTelegramMessage(settings.chatId, messageText, {
        threadId: settings.threadId,
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
      });
    } else {
      // Несколько изображений - отправляем текст + альбом
      await sendTelegramMessage(settings.chatId, messageText, {
        threadId: settings.threadId,
      });
      // Для альбома нужен отдельный метод sendMediaGroup, упростим - отправим по одному
      for (const image of images) {
        const imagePath = path.join(process.cwd(), "uploads", image.imagePath);
        await sendTelegramPhoto(settings.chatId, imagePath, "", {
          threadId: settings.threadId,
        });
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
            console.log(
              `[queue] Processing product_remove for productId: ${payload.productId}`
            );
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
