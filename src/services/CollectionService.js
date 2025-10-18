import { BusinessLogicError } from "../core/errors/AppError.js";
import { validateRequired } from "../core/validators/index.js";
import { COLLECTION_STATUS } from "../constants/index.js";

export class CollectionService {
  constructor(collectionRepository) {
    this.collectionRepo = collectionRepository;
  }

  /**
   * Get active collections
   */
  async getActiveCollections() {
    return this.collectionRepo.findActive();
  }

  /**
   * Get all collections
   */
  async getAllCollections(options = {}) {
    return this.collectionRepo.findMany(
      {},
      {
        orderBy: [
          { status: "desc" }, // Активные сначала
          { startsAt: "desc" }, // Новые периоды сначала
          { id: "desc" }, // По ID как fallback
        ],
        ...options,
      }
    );
  }

  /**
   * Get collection by ID
   */
  async getCollection(collectionId) {
    return this.collectionRepo.findByIdOrFail(collectionId);
  }

  /**
   * Get collection with products
   */
  async getCollectionWithProducts(collectionId) {
    return this.collectionRepo.findWithProducts(collectionId);
  }

  /**
   * Create collection
   */
  async createCollection(data) {
    validateRequired(data, ["title"]);

    const collectionData = {
      title: data.title.trim(),
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      status: "DRAFT",
      notes: data.notes?.trim() || null,
    };

    return this.collectionRepo.create(collectionData);
  }

  /**
   * Update collection
   */
  async updateCollection(collectionId, data) {
    await this.collectionRepo.findByIdOrFail(collectionId);

    const updateData = {};

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.startsAt !== undefined) {
      updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    }
    if (data.endsAt !== undefined) {
      updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;
    }
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;

    return this.collectionRepo.update(collectionId, updateData);
  }

  /**
   * Activate collection
   * Теперь позволяет активировать несколько коллекций одновременно
   */
  async activateCollection(collectionId) {
    const collection = await this.collectionRepo.findByIdOrFail(collectionId);

    if (collection.status === "ACTIVE") {
      throw new BusinessLogicError(
        "Collection is already active",
        "COLLECTION_ALREADY_ACTIVE"
      );
    }

    // Активируем коллекцию без закрытия других активных коллекций
    return this.collectionRepo.activate(collectionId);
  }

  /**
   * Close collection
   */
  async closeCollection(collectionId) {
    const collection = await this.collectionRepo.findByIdOrFail(collectionId);

    if (collection.status === "CLOSED") {
      throw new BusinessLogicError(
        "Collection is already closed",
        "COLLECTION_ALREADY_CLOSED"
      );
    }

    return this.collectionRepo.close(collectionId);
  }

  /**
   * Close all active collections
   * Полезно для массового закрытия всех периодов
   */
  async closeAllActiveCollections() {
    const activeCollections = await this.collectionRepo.findActive();

    if (activeCollections.length === 0) {
      throw new BusinessLogicError(
        "No active collections to close",
        "NO_ACTIVE_COLLECTIONS"
      );
    }

    const results = [];
    for (const collection of activeCollections) {
      try {
        const closed = await this.collectionRepo.close(collection.id);
        results.push(closed);
      } catch (error) {
        console.error(`Failed to close collection ${collection.id}:`, error);
        results.push({ id: collection.id, error: error.message });
      }
    }

    return results;
  }

  /**
   * Update collection product override
   */
  async updateCollectionProduct(collectionId, productId, data) {
    await this.collectionRepo.findByIdOrFail(collectionId);

    const updateData = {};

    if (data.priceOverrideKopecks !== undefined) {
      updateData.priceOverrideKopecks =
        data.priceOverrideKopecks !== null
          ? Number(data.priceOverrideKopecks)
          : null;
    }
    if (data.stepOverrideDecimal !== undefined) {
      updateData.stepOverrideDecimal =
        data.stepOverrideDecimal !== null
          ? String(data.stepOverrideDecimal)
          : null;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = Boolean(data.isActive);
    }
    if (data.stockOverride !== undefined) {
      updateData.stockOverride =
        data.stockOverride !== null ? String(data.stockOverride) : null;
    }
    if (data.displayStockHint !== undefined) {
      updateData.displayStockHint = data.displayStockHint || null;
    }

    return this.collectionRepo.upsertCollectionProduct(
      collectionId,
      productId,
      updateData
    );
  }

  /**
   * Get the first active collection
   */
  async getActiveCollection() {
    const collections = await this.collectionRepo.findActive();
    return collections.length > 0 ? collections[0] : null;
  }

  /**
   * Resolve collection selection
   * Handles cases with single or multiple active collections
   */
  async resolveCollectionSelection(collectionId, requireExplicit = false) {
    const activeCollections = await this.getActiveCollections();

    if (!activeCollections.length) {
      throw new BusinessLogicError(
        "No active collections",
        "NO_ACTIVE_COLLECTION"
      );
    }

    // If collection ID is specified
    if (collectionId !== undefined && collectionId !== null) {
      const collection = activeCollections.find((c) => c.id === collectionId);
      if (!collection) {
        throw new BusinessLogicError(
          "Collection not found or not active",
          "COLLECTION_NOT_FOUND"
        );
      }
      return collection;
    }

    // Multiple active collections and no ID specified
    if (activeCollections.length > 1 && requireExplicit) {
      throw new BusinessLogicError(
        "Multiple active collections, please specify collection_id",
        "COLLECTION_ID_REQUIRED"
      );
    }

    // Return first active collection
    return activeCollections[0];
  }
}
