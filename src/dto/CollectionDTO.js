/**
 * Collection DTO (Data Transfer Object) transformers
 */

/**
 * Collection list view - для списков
 * Use: GET /api/collections
 */
export function toCollectionListDTO(collection) {
  return {
    id: collection.id,
    title: collection.title,
    status: collection.status,
    startsAt: collection.startsAt,
    endsAt: collection.endsAt,
  };
}

/**
 * Collection detail view - с дополнительной информацией
 * Use: GET /api/collections/:id
 */
export function toCollectionDetailDTO(collection) {
  return {
    id: collection.id,
    title: collection.title,
    status: collection.status,
    startsAt: collection.startsAt,
    endsAt: collection.endsAt,
    notes: collection.notes,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

/**
 * Collection admin view - для админки
 */
export function toCollectionAdminDTO(collection) {
  return {
    ...toCollectionDetailDTO(collection),
    productCount: collection._count?.products || 0,
  };
}

// Helper functions
export function toCollectionListDTOArray(collections) {
  return collections.map(toCollectionListDTO);
}

export function toCollectionDetailDTOArray(collections) {
  return collections.map(toCollectionDetailDTO);
}

export function toCollectionAdminDTOArray(collections) {
  return collections.map(toCollectionAdminDTO);
}
