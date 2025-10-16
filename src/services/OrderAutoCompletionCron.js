import { OrderAutoCompletionService } from "./OrderAutoCompletionService.js";

/**
 * Cron job для автоматического завершения заказов
 * Запускается каждый день в 02:00 для проверки и завершения заказов
 */
export class OrderAutoCompletionCron {
  constructor() {
    this.service = new OrderAutoCompletionService();
    this.isRunning = false;
    this.lastRun = null;
    this.intervalId = null;
  }

  /**
   * Запустить cron job
   * @param {Object} options - Опции запуска
   * @param {number} options.intervalHours - Интервал проверки в часах (по умолчанию 24)
   * @param {number} options.runAtHour - Час запуска (по умолчанию 2)
   */
  start(options = {}) {
    const { intervalHours = 24, runAtHour = 2 } = options;

    if (this.intervalId) {
      console.log("[OrderAutoCompletionCron] Already running");
      return;
    }

    console.log(
      `[OrderAutoCompletionCron] Starting with interval: ${intervalHours}h, run at: ${runAtHour}:00`
    );

    // Запускаем сразу для тестирования
    this.run();

    // Затем запускаем по расписанию
    this.intervalId = setInterval(
      () => {
        const now = new Date();
        const currentHour = now.getHours();

        // Запускаем только в указанное время
        if (currentHour === runAtHour) {
          this.run();
        }
      },
      intervalHours * 60 * 60 * 1000
    ); // Конвертируем часы в миллисекунды
  }

  /**
   * Остановить cron job
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[OrderAutoCompletionCron] Stopped");
    }
  }

  /**
   * Выполнить проверку и завершение заказов
   */
  async run() {
    if (this.isRunning) {
      console.log("[OrderAutoCompletionCron] Already running, skipping");
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      console.log(
        "[OrderAutoCompletionCron] Starting auto-completion check..."
      );

      const result = await this.service.autoCompleteOrders();

      const duration = Date.now() - startTime.getTime();
      this.lastRun = new Date();

      console.log(`[OrderAutoCompletionCron] Completed in ${duration}ms`);
      console.log(
        `[OrderAutoCompletionCron] Results: ${result.completed} orders completed, ${result.errors.length} errors`
      );

      if (result.errors.length > 0) {
        console.error("[OrderAutoCompletionCron] Errors:", result.errors);
      }

      // Отправляем уведомление администратору, если есть завершенные заказы
      if (result.completed > 0) {
        await this.notifyAdmin(result);
      }
    } catch (error) {
      console.error("[OrderAutoCompletionCron] Fatal error:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Уведомить администратора о результатах
   * @param {Object} result - Результаты выполнения
   */
  async notifyAdmin(result) {
    try {
      // TODO: Реализовать отправку уведомления администратору
      // Можно использовать Telegram bot или email
      console.log(
        `[OrderAutoCompletionCron] Admin notification: ${result.completed} orders auto-completed`
      );
    } catch (error) {
      console.error("[OrderAutoCompletionCron] Failed to notify admin:", error);
    }
  }

  /**
   * Получить статус cron job
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      hasInterval: !!this.intervalId,
    };
  }

  /**
   * Запустить проверку вручную (для тестирования)
   */
  async runManual() {
    console.log("[OrderAutoCompletionCron] Manual run requested");
    await this.run();
  }
}
