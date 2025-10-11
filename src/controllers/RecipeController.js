import { BaseController } from "../core/base/BaseController.js";

/**
 * Controller for recipe endpoints (public and admin)
 */
export class RecipeController extends BaseController {
  constructor(recipeService) {
    super();
    this.recipeService = recipeService;
  }

  // ----------------------
  // Public endpoints
  // ----------------------

  /**
   * GET /api/public/recipes
   * Get published recipes with pagination
   */
  getPublishedRecipes = async (req, res) => {
    const { page, pageSize } = req.query || {};

    const result = await this.recipeService.getPublishedRecipes({
      page,
      pageSize,
    });

    this.success(res, result);
  };

  /**
   * GET /api/public/recipes/:slug
   * Get recipe by slug
   */
  getRecipeBySlug = async (req, res) => {
    const { slug } = req.params;

    const result = await this.recipeService.getRecipeBySlug(slug);

    this.success(res, result);
  };

  // ----------------------
  // Admin endpoints
  // ----------------------

  /**
   * GET /api/admin/recipes
   * Get all recipes (admin)
   */
  getAllRecipes = async (req, res) => {
    const result = await this.recipeService.getAllRecipes();

    this.success(res, result);
  };

  /**
   * GET /api/admin/recipes/:id
   * Get recipe by ID (admin)
   */
  getRecipeById = async (req, res) => {
    const id = this.getIdParam(req);

    const result = await this.recipeService.getRecipeById(id);

    this.success(res, result);
  };

  /**
   * POST /api/admin/recipes
   * Create recipe
   */
  createRecipe = async (req, res) => {
    const authorId = this.getUserId(req);

    const result = await this.recipeService.createRecipe(
      req.body || {},
      authorId
    );

    this.created(res, result);
  };

  /**
   * PATCH /api/admin/recipes/:id
   * Update recipe
   */
  updateRecipe = async (req, res) => {
    const id = this.getIdParam(req);

    const result = await this.recipeService.updateRecipe(id, req.body || {});

    this.success(res, result);
  };

  /**
   * DELETE /api/admin/recipes/:id
   * Delete recipe
   */
  deleteRecipe = async (req, res) => {
    const id = this.getIdParam(req);

    const result = await this.recipeService.deleteRecipe(id);

    this.success(res, result);
  };

  /**
   * POST /api/admin/recipes/upload
   * Upload media for recipes
   */
  uploadMedia = async (req, res) => {
    if (!req.files || !req.files.length) {
      return this.clientError(res, "No files uploaded", 400, {
        code: "NO_FILES",
      });
    }

    const result = req.files.map((file) => {
      const relPath = ["recipes", file.filename].join("/");
      return {
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: relPath,
        url: `/uploads/${relPath}`,
      };
    });

    this.success(res, { files: result });
  };
}
