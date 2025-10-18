import { PrismaClient } from "@prisma/client";

/**
 * Сервис для автоматического завершения заказов
 * Завершает заказы через 3 дня после закрытия периода
 */
export class OrderAutoCompletionService {
  constructor(prisma = new PrismaClient()) {
    this.prisma = prisma;
  }

  /**
   * Автоматически завершить заказы, которые должны быть завершены
   * @returns {Promise<{completed: number, errors: string[]}>}
   */
  async autoCompleteOrders() {
    const errors = [];
    let completedCount = 0;

    try {
      // Находим заказы, которые нужно автоматически завершить
      const ordersToComplete = await this.findOrdersToAutoComplete();

      console.log(
        `[OrderAutoCompletion] Found ${ordersToComplete.length} orders to auto-complete`
      );

      for (const order of ordersToComplete) {
        try {
          await this.completeOrder(order);
          completedCount++;
          console.log(
            `[OrderAutoCompletion] Auto-completed order ${order.id} (${order.orderNumber})`
          );
        } catch (error) {
          const errorMsg = `Failed to auto-complete order ${order.id}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[OrderAutoCompletion] ${errorMsg}`);
        }
      }

      return { completed: completedCount, errors };
    } catch (error) {
      console.error("[OrderAutoCompletion] Fatal error:", error);
      throw error;
    }
  }

  /**
   * Найти заказы, которые нужно автоматически завершить
   * @returns {Promise<Array>}
   */
  async findOrdersToAutoComplete() {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    return await this.prisma.order.findMany({
      where: {
        status: "SUBMITTED", // Только заказы в статусе "Ожидает оплаты"
        collection: {
          status: "CLOSED", // Период должен быть закрыт
          endsAt: {
            lte: threeDaysAgo, // Период закрылся более 3 дней назад
          },
        },
      },
      include: {
        collection: {
          select: {
            id: true,
            title: true,
            endsAt: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        submittedAt: "asc", // Сначала старые заказы
      },
    });
  }

  /**
   * Завершить конкретный заказ
   * @param {Object} order - Заказ для завершения
   */
  async completeOrder(order) {
    // Обновляем статус заказа на "Выполнен" (COMPLETED)
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        updatedAt: new Date(),
      },
    });

    // Логируем автоматическое завершение
    await this.logAutoCompletion(order);
  }

  /**
   * Логировать автоматическое завершение заказа
   * @param {Object} order - Завершенный заказ
   */
  async logAutoCompletion(order) {
    const logMessage = `Заказ ${order.orderNumber} автоматически завершен через 3 дня после закрытия периода "${order.collection.title}"`;

    // Можно добавить запись в таблицу логов, если она есть
    // Пока просто логируем в консоль
    console.log(`[OrderAutoCompletion] ${logMessage}`);

    // TODO: Добавить уведомление администратору
    // TODO: Добавить уведомление пользователю
  }

  /**
   * Получить статистику заказов, ожидающих автоматического завершения
   * @returns {Promise<Object>}
   */
  async getAutoCompletionStats() {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const [pendingCount, overdueCount] = await Promise.all([
      // Заказы, которые будут завершены в ближайшие дни
      this.prisma.order.count({
        where: {
          status: "SUBMITTED",
          collection: {
            status: "CLOSED",
            endsAt: {
              gte: threeDaysAgo,
            },
          },
        },
      }),
      // Заказы, которые уже должны были быть завершены
      this.prisma.order.count({
        where: {
          status: "SUBMITTED",
          collection: {
            status: "CLOSED",
            endsAt: {
              lt: threeDaysAgo,
            },
          },
        },
      }),
    ]);

    return {
      pending: pendingCount,
      overdue: overdueCount,
      total: pendingCount + overdueCount,
    };
  }

  /**
   * Закрыть соединение с базой данных
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }
}
