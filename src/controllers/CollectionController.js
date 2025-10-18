import { BaseController } from "../core/base/BaseController.js";

export class CollectionController extends BaseController {
  constructor(collectionService) {
    super();
    this.collectionService = collectionService;
    this.bindMethods();
  }

  /**
   * Get the first active collection
   * GET /api/collections/active
   */
  async getActiveCollection(req, res) {
    const collection = await this.collectionService.getActiveCollection();

    return this.success(res, { collection });
  }

  /**
   * Get active collections
   * GET /api/collections
   */
  async getActiveCollections(req, res) {
    const collections = await this.collectionService.getActiveCollections();

    return this.success(res, { collections });
  }

  /**
   * Get all collections (admin)
   * GET /api/admin/collections
   */
  async getAllCollections(req, res) {
    const collections = await this.collectionService.getAllCollections();

    return this.success(res, { collections });
  }

  /**
   * Create collection (admin)
   * POST /api/admin/collections
   */
  async createCollection(req, res) {
    const collection = await this.collectionService.createCollection(req.body);

    return this.created(res, { collection });
  }

  /**
   * Update collection (admin)
   * PATCH /api/admin/collections/:id
   */
  async updateCollection(req, res) {
    const collectionId = Number(req.params.id);
    const collection = await this.collectionService.updateCollection(
      collectionId,
      req.body
    );

    return this.success(res, { collection });
  }

  /**
   * Activate collection (admin)
   * PATCH /api/admin/collections/:id/activate
   */
  async activateCollection(req, res) {
    const collectionId = Number(req.params.id);
    const collection =
      await this.collectionService.activateCollection(collectionId);

    return this.success(res, { collection });
  }

  /**
   * Close collection (admin)
   * PATCH /api/admin/collections/:id/close
   */
  async closeCollection(req, res) {
    const collectionId = Number(req.params.id);
    const collection =
      await this.collectionService.closeCollection(collectionId);

    return this.success(res, { collection });
  }

  /**
   * Close all active collections (admin)
   * PATCH /api/admin/collections/close-all
   */
  async closeAllActiveCollections(req, res) {
    const results = await this.collectionService.closeAllActiveCollections();

    return this.success(res, { results }, "Все активные периоды закрыты");
  }
}
