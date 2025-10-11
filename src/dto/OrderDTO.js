/**
 * Order DTO (Data Transfer Object) transformers
 * Different views for different use cases to reduce response size
 */

/**
 * Order list view - краткая версия для списков
 * Use: GET /api/orders
 * Size: ~2 KB per order
 */
export function toOrderListDTO(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalKopecks: order.totalKopecks,
    createdAt: order.createdAt,
    collectionId: order.collectionId,
    deliveryType: order.deliveryType,
  };
}

/**
 * Order detail view - полная версия
 * Use: GET /api/orders/:id
 * Size: ~5 KB per order
 */
export function toOrderDetailDTO(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalKopecks: order.totalKopecks,
    deliveryCostKopecks: order.deliveryCostKopecks,
    deliveryType: order.deliveryType,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    paymentProof: order.paymentProof,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    collectionId: order.collectionId,
    userId: order.userId,
    collection: order.collection
      ? {
          id: order.collection.id,
          title: order.collection.title,
          status: order.collection.status,
        }
      : null,
    items: order.items
      ? order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          titleSnapshot: item.titleSnapshot,
          unitLabelSnapshot: item.unitLabelSnapshot,
          quantityDecimal:
            item.quantityDecimal?.toString() || item.quantityDecimal,
          unitPriceKopecks: item.unitPriceKopecks,
          subtotalKopecks: item.subtotalKopecks,
          imagePathSnapshot: item.imagePathSnapshot,
        }))
      : [],
  };
}

/**
 * Order admin view - для админки
 * Use: GET /api/admin/orders
 * Size: ~6 KB per order (все поля + user info + product info)
 */
export function toOrderAdminDTO(order) {
  const baseDTO = toOrderDetailDTO(order);

  return {
    ...baseDTO,
    user: order.user
      ? {
          id: order.user.id,
          name: order.user.name,
          firstName: order.user.firstName,
          lastName: order.user.lastName,
          email: order.user.email,
          phone: order.user.phone,
          telegramUsername: order.user.telegramUsername,
        }
      : null,
    // Guest данные
    isGuestOrder: order.isGuestOrder,
    guestName: order.guestName,
    guestPhone: order.guestPhone,
    guestEmail: order.guestEmail,
    guestContactMethod: order.guestContactMethod,
    guestContactInfo: order.guestContactInfo,
    // Добавляем полные данные продукта для каждого item
    items: order.items
      ? order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          titleSnapshot: item.titleSnapshot,
          unitLabelSnapshot: item.unitLabelSnapshot,
          quantityDecimal:
            item.quantityDecimal?.toString() || item.quantityDecimal,
          quantity: item.quantityDecimal?.toString() || item.quantityDecimal, // Алиас для удобства
          unitPriceKopecks: item.unitPriceKopecks,
          subtotalKopecks: item.subtotalKopecks,
          imagePathSnapshot: item.imagePathSnapshot,
          // Добавляем актуальные данные продукта
          product: item.product
            ? {
                id: item.product.id,
                title: item.product.title,
                imagePath: item.product.imagePath,
                unitLabel: item.product.unitLabel,
                priceKopecks: item.product.priceKopecks,
                isActive: item.product.isActive,
              }
            : null,
        }))
      : [],
  };
}

/**
 * Order summary view - для статистики
 * Use: Dashboard, analytics
 * Size: ~1 KB per order
 */
export function toOrderSummaryDTO(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalKopecks: order.totalKopecks,
    createdAt: order.createdAt,
  };
}

// ========================================
// Helper functions for arrays
// ========================================

export function toOrderListDTOArray(orders) {
  return orders.map(toOrderListDTO);
}

export function toOrderDetailDTOArray(orders) {
  return orders.map(toOrderDetailDTO);
}

export function toOrderAdminDTOArray(orders) {
  return orders.map(toOrderAdminDTO);
}

export function toOrderSummaryDTOArray(orders) {
  return orders.map(toOrderSummaryDTO);
}
