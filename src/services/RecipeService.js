import { ValidationError, NotFoundError } from "../core/errors/AppError.js";
import {
  normalizeRecipeContent,
  ensureRecipeSlug,
  toRecipeSummary,
  toRecipeDetail,
  RECIPE_STATUSES,
} from "../utils/recipes.js";

/**
 * Service for recipe business logic
 */
export class RecipeService {
  constructor(recipeRepository, telegramBotService) {
    this.recipeRepo = recipeRepository;
    this.telegramBot = telegramBotService;
  }

  // ----------------------
  // Public methods
  // ----------------------

  /**
   * Get published recipes with pagination
   */
  async getPublishedRecipes({ page, pageSize }) {
    const normalizedPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
    const normalizedPageSize = Math.min(
      24,
      Math.max(1, Number.parseInt(pageSize ?? "10", 10) || 10)
    );

    const result = await this.recipeRepo.findPublished({
      page: normalizedPage,
      pageSize: normalizedPageSize,
    });

    return {
      recipes: result.recipes.map((recipe) => toRecipeSummary(recipe)),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * Get recipe by slug
   */
  async getRecipeBySlug(slug) {
    const recipe = await this.recipeRepo.findBySlug(slug);

    if (!recipe || recipe.status !== "PUBLISHED") {
      throw new NotFoundError("Recipe not found", "RECIPE_NOT_FOUND");
    }

    return { recipe: toRecipeDetail(recipe) };
  }

  // ----------------------
  // Admin methods
  // ----------------------

  /**
   * Get all recipes (admin)
   */
  async getAllRecipes() {
    const recipes = await this.recipeRepo.findAll();
    return {
      recipes: recipes.map((recipe) => toRecipeSummary(recipe)),
    };
  }

  /**
   * Get recipe by ID (admin)
   */
  async getRecipeById(id) {
    const recipe = await this.recipeRepo.findByIdWithAuthor(id);

    if (!recipe) {
      throw new NotFoundError("Recipe not found", "RECIPE_NOT_FOUND");
    }

    return { recipe: toRecipeDetail(recipe) };
  }

  /**
   * Create recipe
   */
  async createRecipe(data, authorId) {
    const { title, content, status, excerpt, coverImagePath, publish, slug } =
      data;

    // Validation
    if (!title || !String(title).trim()) {
      throw new ValidationError("Title is required", "TITLE_REQUIRED");
    }

    const normalizedStatus = this._normalizeStatus(status, publish);
    if (!RECIPE_STATUSES.has(normalizedStatus)) {
      throw new ValidationError("Invalid status", "INVALID_STATUS");
    }

    // Normalize content
    const normalizedContent = normalizeRecipeContent(content);

    // Ensure unique slug
    const finalSlug = await ensureRecipeSlug(
      this.recipeRepo.prisma,
      slug || title
    );

    // Create recipe
    const now = new Date();
    const recipeData = {
      title: String(title).trim(),
      content: normalizedContent,
      status: normalizedStatus,
      excerpt: excerpt ?? null,
      coverImagePath: coverImagePath ?? null,
      publishedAt: normalizedStatus === "PUBLISHED" ? now : null,
      authorId,
      slug: finalSlug,
    };

    const created = await this.recipeRepo.createRecipe(recipeData);

    // Enqueue telegram message if published
    if (normalizedStatus === "PUBLISHED") {
      try {
        await this.telegramBot.enqueueMessage("recipe", {
          recipeId: created.id,
        });
      } catch (error) {
        console.error(
          "[RecipeService] Failed to enqueue telegram message:",
          error
        );
      }
    }

    return { recipe: toRecipeDetail(created) };
  }

  /**
   * Update recipe
   */
  async updateRecipe(id, data) {
    const existing = await this.recipeRepo.findByIdWithAuthor(id);

    if (!existing) {
      throw new NotFoundError("Recipe not found", "RECIPE_NOT_FOUND");
    }

    const { title, content, status, excerpt, coverImagePath, publish, slug } =
      data;

    // Build update data
    const updateData = {};

    if (title !== undefined) {
      updateData.title = String(title).trim();
    }

    if (excerpt !== undefined) {
      updateData.excerpt = excerpt ?? null;
    }

    if (coverImagePath !== undefined) {
      updateData.coverImagePath = coverImagePath ?? null;
    }

    if (content !== undefined) {
      updateData.content = normalizeRecipeContent(content);
    }

    // Status handling
    let nextStatus = existing.status;
    if (publish === true) {
      nextStatus = "PUBLISHED";
    } else if (status !== undefined) {
      nextStatus = status;
      if (!RECIPE_STATUSES.has(nextStatus)) {
        throw new ValidationError("Invalid status", "INVALID_STATUS");
      }
    }

    updateData.status = nextStatus;

    // publishedAt handling
    if (nextStatus === "PUBLISHED" && !existing.publishedAt) {
      updateData.publishedAt = new Date();
    } else if (nextStatus !== "PUBLISHED") {
      updateData.publishedAt = null;
    }

    // Slug handling
    if (slug !== undefined) {
      updateData.slug = await ensureRecipeSlug(
        this.recipeRepo.prisma,
        slug || title || existing.title,
        id
      );
    }

    const updated = await this.recipeRepo.updateRecipe(id, updateData);

    // Enqueue telegram message if published for the first time
    if (nextStatus === "PUBLISHED" && !existing.publishedAt) {
      try {
        await this.telegramBot.enqueueMessage("recipe", {
          recipeId: updated.id,
        });
      } catch (error) {
        console.error(
          "[RecipeService] Failed to enqueue telegram message:",
          error
        );
      }
    }

    return { recipe: toRecipeDetail(updated) };
  }

  /**
   * Delete recipe
   */
  async deleteRecipe(id) {
    const existing = await this.recipeRepo.findById(id);

    if (!existing) {
      throw new NotFoundError("Recipe not found", "RECIPE_NOT_FOUND");
    }

    await this.recipeRepo.deleteRecipe(id);

    return { ok: true };
  }

  // ----------------------
  // Helpers
  // ----------------------

  /**
   * Normalize recipe status
   * @private
   */
  _normalizeStatus(status, publish) {
    if (publish === true) {
      return "PUBLISHED";
    }
    if (status && RECIPE_STATUSES.has(status)) {
      return status;
    }
    return "DRAFT";
  }
}
