import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAdmin } from "../../middleware/auth.js";
import { OrderAutoCompletionService } from "../../services/OrderAutoCompletionService.js";

export function createOrderAutoCompletionRoutes() {
  const router = Router();
  const service = new OrderAutoCompletionService();

  /**
   * Получить статистику заказов, ожидающих автоматического завершения
   * GET /api/admin/orders/auto-completion/stats
   */
  router.get(
    "/stats",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const stats = await service.getAutoCompletionStats();
      res.json({ stats });
    })
  );

  /**
   * Запустить автоматическое завершение заказов вручную
   * POST /api/admin/orders/auto-completion/run
   */
  router.post(
    "/run",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await service.autoCompleteOrders();
      res.json({
        success: true,
        message: `Автоматически завершено ${result.completed} заказов`,
        result,
      });
    })
  );

  /**
   * Получить список заказов, которые будут автоматически завершены
   * GET /api/admin/orders/auto-completion/pending
   */
  router.get(
    "/pending",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const orders = await service.findOrdersToAutoComplete();
      res.json({ orders });
    })
  );

  return router;
}
