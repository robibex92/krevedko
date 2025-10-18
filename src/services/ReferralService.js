// РЕФЕРАЛЬНАЯ ПРОГРАММА ЗАКОММЕНТИРОВАНА - НЕ РЕАЛИЗУЕМ
// import { ValidationError, NotFoundError } from "../core/errors/AppError.js";

// /**
//  * Service for managing referral program
//  */
// export class ReferralService {
//   constructor(userRepository) {
//     this.userRepo = userRepository;
//   }

//   /**
//    * Get referral info for user (with auto-creation of referral code)
//    */
//   async getReferralInfo(userId) {
//     const user = await this.userRepo.prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         id: true,
//         referralCode: true,
//         loyaltyPoints: true,
//         telegramId: true,
//         telegramUsername: true,
//         telegramPhotoUrl: true,
//         referrals: {
//           select: {
//             id: true,
//             name: true,
//             email: true,
//             createdAt: true,
//           },
//         },
//       },
//     });

//     if (!user) {
//       throw new NotFoundError("User not found", "USER_NOT_FOUND");
//     }

//     // Auto-create referral code if not exists
//     if (!user.referralCode) {
//       const referralCode = this.generateReferralCode(user.id);
//       await this.userRepo.update(user.id, { referralCode });
//       user.referralCode = referralCode;
//     }

//     return { user };
//   }

//   /**
//    * Validate and get referrer info by referral code
//    */
//   async validateReferralCode(referralCode) {
//     if (!referralCode) {
//       throw new ValidationError("REFERRAL_CODE_REQUIRED");
//     }

//     const referrer = await this.userRepo.prisma.user.findUnique({
//       where: { referralCode },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//       },
//     });

//     if (!referrer) {
//       throw new NotFoundError("Invalid referral code", "INVALID_REFERRAL_CODE");
//     }

//     return {
//       success: true,
//       referrerId: referrer.id,
//       referrerName: referrer.name || referrer.email || "Пользователь",
//     };
//   }

//   /**
//    * Get referral statistics for user
//    */
//   async getReferralStats(userId) {
//     // Get total count
//     const stats = await this.userRepo.prisma.user.aggregate({
//       where: { referredBy: userId },
//       _count: { id: true },
//     });

//     // Get detailed referral list with orders
//     const referrals = await this.userRepo.prisma.user.findMany({
//       where: { referredBy: userId },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         createdAt: true,
//         orders: {
//           select: { totalKopecks: true },
//         },
//       },
//     });

//     // Calculate total referral revenue
//     const totalReferralRevenue = referrals.reduce(
//       (sum, ref) =>
//         sum +
//         ref.orders.reduce(
//           (orderSum, order) => orderSum + (order.totalKopecks || 0),
//           0
//         ),
//       0
//     );

//     return {
//       totalReferrals: stats._count.id,
//       referrals,
//       totalReferralRevenue,
//     };
//   }

//   /**
//    * Generate referral code for user
//    * @private
//    */
//   generateReferralCode(userId) {
//     const randomPart = Math.random().toString(36).substr(2, 4).toUpperCase();
//     return `REF${userId}${randomPart}`;
//   }
// }
