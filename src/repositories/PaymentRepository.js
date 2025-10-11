/**
 * Payment Repository
 */

import { BaseRepository } from "../core/base/BaseRepository.js";

export class PaymentRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "payment");
  }

  /**
   * Найти платеж по ID платежа в системе провайдера
   */
  async findByProviderPaymentId(providerPaymentId) {
    return await this.model.findUnique({
      where: { providerPaymentId },
      include: {
        order: true,
      },
    });
  }

  /**
   * Найти все платежи для заказа
   */
  async findByOrderId(orderId) {
    return await this.model.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Создать платеж
   */
  async create(data) {
    return await this.model.create({
      data,
    });
  }

  /**
   * Обновить платеж
   */
  async update(id, data) {
    return await this.model.update({
      where: { id },
      data,
    });
  }
}
