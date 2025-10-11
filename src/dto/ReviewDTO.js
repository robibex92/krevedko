/**
 * Review DTO (Data Transfer Object) transformers
 */

import { toUserPublicDTO } from "./UserDTO.js";

/**
 * Review list view - для списков отзывов
 */
export function toReviewListDTO(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    imagePath: review.imagePath,
    createdAt: review.createdAt,
    user: review.user ? toUserPublicDTO(review.user) : null,
  };
}

/**
 * Review detail view - детальная информация
 */
export function toReviewDetailDTO(review) {
  return {
    ...toReviewListDTO(review),
    updatedAt: review.updatedAt,
  };
}

/**
 * Review admin view - для админки
 */
export function toReviewAdminDTO(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    imagePath: review.imagePath,
    userId: review.userId,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    user: review.user
      ? {
          id: review.user.id,
          name: review.user.name,
          email: review.user.email,
        }
      : null,
  };
}

// Helper functions
export function toReviewListDTOArray(reviews) {
  return reviews.map(toReviewListDTO);
}

export function toReviewDetailDTOArray(reviews) {
  return reviews.map(toReviewDetailDTO);
}

export function toReviewAdminDTOArray(reviews) {
  return reviews.map(toReviewAdminDTO);
}
