import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";

/**
 * Create order management routes
 */
export function createOrderManagementRoutes(container) {
  const router = Router();
  const orderController = container.resolve("orderController");

  // Все роуты требуют аутентификации
  // router.use(requireAuth); // Временно отключено для отладки

  // Тестовый маршрут
  router.get("/test", (req, res) => {
    res.json({ message: "Order management routes are working!" });
  });

  // Частичная отмена заказа
  router.post(
    "/orders/:id/partial-cancel",
    asyncHandler(orderController.partialCancelOrder)
  );

  // Изменение товаров в заказе
  router.patch(
    "/orders/:id/items",
    asyncHandler(orderController.editOrderItems)
  );

  // Получение заказа для редактирования
  router.get("/orders/:id/edit", asyncHandler(orderController.getOrderForEdit));

  // История изменений заказа
  router.get(
    "/orders/:id/history",
    asyncHandler(orderController.getOrderHistory)
  );

  // Добавление товара в заказ
  router.post(
    "/orders/:id/items",
    asyncHandler(orderController.addItemToOrder)
  );

  // Удаление товара из заказа
  router.delete(
    "/orders/:id/items/:itemId",
    asyncHandler(orderController.removeItemFromOrder)
  );

  // Обновление количества товара в заказе
  router.patch(
    "/orders/items/:itemId/quantity",
    asyncHandler(orderController.updateItemQuantity)
  );

  // Изменение статуса заказа (только админы)
  router.patch(
    "/orders/:id/status",
    requireAdmin,
    asyncHandler(orderController.updateOrderStatusForManagement)
  );

  // Получение доступных действий
  router.get(
    "/orders/:id/actions",
    asyncHandler(orderController.getOrderActions)
  );

  // Отправка уведомления
  router.post(
    "/orders/:id/notify",
    asyncHandler(orderController.sendOrderNotification)
  );

  // Статистика заказа
  router.get("/orders/:id/stats", asyncHandler(orderController.getOrderStats));

  return router;
}
