import { ValidationError, NotFoundError } from "../core/errors/AppError.js";
import { makeOrderNumber } from "./pricing.js";

/**
 * Service for managing user profiles
 */
export class ProfileService {
  constructor(userRepository, orderRepository) {
    this.userRepo = userRepository;
    this.orderRepo = orderRepository;
    this.profileCache = new Map(); // Кэш профилей
    this.cacheTimeout = 5 * 60 * 1000; // 5 минут
  }

  /**
   * Get user profile with orders
   */
  async getProfile(userId) {
    // Проверяем кэш
    const cacheKey = `profile_${userId}`;
    const cached = this.profileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`[ProfileService] Using cached profile for user ${userId}`);
      return cached.data;
    }

    console.log(`[ProfileService] Loading fresh profile for user ${userId}`);
    
    // Fetch user and orders in parallel
    const [user, orders] = await Promise.all([
      this.userRepo.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          telegramId: true,
          telegramUsername: true,
          telegramPhotoUrl: true,
          avatarPath: true,
          addressStreet: true,
          addressHouse: true,
          addressApartment: true,
          loyaltyPoints: true,
        },
      }),
      this.orderRepo.prisma.order.findMany({
        where: { userId },
        orderBy: { submittedAt: "desc" },
        include: { collection: { select: { id: true, title: true } } },
      }),
    ]);

    if (!user) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

    // Map orders with order numbers
    const mappedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber || makeOrderNumber(order.id),
      status: order.status,
      totalKopecks: order.totalKopecks,
      submittedAt: order.submittedAt,
      deliveryType: order.deliveryType,
      collection: order.collection,
    }));

    // Group orders by status
    const orderGroups = {
      active: mappedOrders.filter((o) => o.status === "SUBMITTED"),
      completed: mappedOrders.filter((o) => o.status === "PAID"),
      cancelled: mappedOrders.filter((o) => o.status === "CANCELLED"),
    };

    const profileData = {
      user,
      orders: orderGroups,
      summary: {
        total: mappedOrders.length,
        active: orderGroups.active.length,
        completed: orderGroups.completed.length,
        cancelled: orderGroups.cancelled.length,
      },
    };

    // Сохраняем в кэш
    this.profileCache.set(cacheKey, {
      data: profileData,
      timestamp: Date.now(),
    });

    return profileData;
  }

  /**
   * Clear profile cache for user
   */
  clearProfileCache(userId) {
    const cacheKey = `profile_${userId}`;
    this.profileCache.delete(cacheKey);
    console.log(`[ProfileService] Cleared cache for user ${userId}`);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updates) {
    const {
      firstName,
      lastName,
      name,
      phone,
      addressStreet,
      addressHouse,
      addressApartment,
    } = updates;

    const data = {};
    const normalize = (value) =>
      value === undefined ? undefined : String(value).trim() || null;

    // Normalize fields
    if (firstName !== undefined) data.firstName = normalize(firstName);
    if (lastName !== undefined) data.lastName = normalize(lastName);
    if (phone !== undefined) data.phone = normalize(phone);
    if (addressStreet !== undefined)
      data.addressStreet = normalize(addressStreet);
    if (addressHouse !== undefined) data.addressHouse = normalize(addressHouse);
    if (addressApartment !== undefined)
      data.addressApartment = normalize(addressApartment);

    // Handle name field logic
    // If name is explicitly provided, use it
    // Otherwise, combine firstName + lastName
    if (
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      name !== undefined
    ) {
      const explicitName = normalize(name);
      if (explicitName !== undefined) {
        data.name = explicitName;
      } else {
        // Get current user to merge with new data
        const currentUser = await this.userRepo.findByIdOrFail(userId);

        const first =
          data.firstName !== undefined ? data.firstName : currentUser.firstName;
        const last =
          data.lastName !== undefined ? data.lastName : currentUser.lastName;
        const combined = [first, last].filter(Boolean).join(" ") || null;
        data.name = combined;
      }
    }

    // Validate that at least one field is being updated
    if (Object.keys(data).length === 0) {
      throw new ValidationError("NO_PROFILE_UPDATES");
    }

    // Update user
    const updatedUser = await this.userRepo.update(userId, data);

    return updatedUser;
  }

  /**
   * Update user avatar
   */
  async updateAvatar(userId, avatarPath) {
    if (!avatarPath) {
      throw new ValidationError("AVATAR_PATH_REQUIRED");
    }

    const updatedUser = await this.userRepo.update(userId, {
      avatarPath,
    });

    return updatedUser;
  }

  /**
   * Get user summary (just user info, no orders)
   */
  async getUserSummary(userId) {
    const user = await this.userRepo.findByIdOrFail(userId);
    return user;
  }
}
