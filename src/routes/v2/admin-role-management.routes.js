import { Router } from "express";
import { asyncHandler } from "../../core/middleware/asyncHandler.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { securityLogger } from "../../middleware/securityLogger.js";

export function createAdminRoleManagementRoutes() {
  const router = Router();

  /**
   * Назначить роль администратора пользователю
   * POST /api/admin/roles/promote
   */
  router.post(
    "/promote",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { userId, reason } = req.body;
      const adminId = req.user.id;

      if (!userId || !reason) {
        return res.status(400).json({ 
          error: "MISSING_REQUIRED_FIELDS",
          message: "userId and reason are required"
        });
      }

      const prisma = req.app.locals.prisma;

      // Проверяем, что пользователь существует
      const targetUser = await prisma.user.findUnique({
        where: { id: parseInt(userId) }
      });

      if (!targetUser) {
        return res.status(404).json({ 
          error: "USER_NOT_FOUND",
          message: "User not found"
        });
      }

      // Проверяем, что пользователь еще не администратор
      if (targetUser.role === "ADMIN") {
        return res.status(400).json({ 
          error: "ALREADY_ADMIN",
          message: "User is already an administrator"
        });
      }

      // Назначаем роль администратора
      const updatedUser = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { role: "ADMIN" }
      });

      // Логируем действие
      securityLogger.log('ROLE_PROMOTION', {
        timestamp: new Date().toISOString(),
        adminId,
        targetUserId: userId,
        targetUserEmail: targetUser.email,
        reason,
        severity: 'HIGH',
      });

      res.json({
        success: true,
        message: `User ${targetUser.email} has been promoted to administrator`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role
        }
      });
    })
  );

  /**
   * Снять роль администратора с пользователя
   * POST /api/admin/roles/demote
   */
  router.post(
    "/demote",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { userId, reason } = req.body;
      const adminId = req.user.id;

      if (!userId || !reason) {
        return res.status(400).json({ 
          error: "MISSING_REQUIRED_FIELDS",
          message: "userId and reason are required"
        });
      }

      const prisma = req.app.locals.prisma;

      // Проверяем, что пользователь существует
      const targetUser = await prisma.user.findUnique({
        where: { id: parseInt(userId) }
      });

      if (!targetUser) {
        return res.status(404).json({ 
          error: "USER_NOT_FOUND",
          message: "User not found"
        });
      }

      // Проверяем, что пользователь является администратором
      if (targetUser.role !== "ADMIN") {
        return res.status(400).json({ 
          error: "NOT_ADMIN",
          message: "User is not an administrator"
        });
      }

      // Не позволяем снять роль с самого себя
      if (parseInt(userId) === adminId) {
        return res.status(400).json({ 
          error: "CANNOT_DEMOTE_SELF",
          message: "Cannot demote yourself"
        });
      }

      // Снимаем роль администратора
      const updatedUser = await prisma.user.update({
        where: { id: parseInt(userId) },
        data: { role: "CUSTOMER" }
      });

      // Логируем действие
      securityLogger.log('ROLE_DEMOTION', {
        timestamp: new Date().toISOString(),
        adminId,
        targetUserId: userId,
        targetUserEmail: targetUser.email,
        reason,
        severity: 'HIGH',
      });

      res.json({
        success: true,
        message: `User ${targetUser.email} has been demoted from administrator`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role
        }
      });
    })
  );

  /**
   * Получить список всех администраторов
   * GET /api/admin/roles/admins
   */
  router.get(
    "/admins",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const prisma = req.app.locals.prisma;

      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'asc' }
      });

      res.json({ admins });
    })
  );

  /**
   * Получить историю изменений ролей
   * GET /api/admin/roles/history
   */
  router.get(
    "/history",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      // TODO: Реализовать таблицу для истории изменений ролей
      // Пока возвращаем пустой массив
      res.json({ history: [] });
    })
  );

  return router;
}
