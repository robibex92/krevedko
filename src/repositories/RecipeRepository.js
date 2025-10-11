import { BaseRepository } from "../core/base/BaseRepository.js";

const recipeAuthorInclude = {
  author: {
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
};

/**
 * Repository for recipes
 */
export class RecipeRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, "recipe");
  }

  // ----------------------
  // Public methods
  // ----------------------

  /**
   * Find published recipes with pagination
   */
  async findPublished({ page = 1, pageSize = 10 }) {
    const skip = (page - 1) * pageSize;

    const [total, recipes] = await Promise.all([
      this.prisma.recipe.count({ where: { status: "PUBLISHED" } }),
      this.prisma.recipe.findMany({
        where: { status: "PUBLISHED" },
        include: recipeAuthorInclude,
        orderBy: { publishedAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      recipes,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Find recipe by slug (public)
   */
  async findBySlug(slug) {
    return this.prisma.recipe.findUnique({
      where: { slug },
      include: recipeAuthorInclude,
    });
  }

  // ----------------------
  // Admin methods
  // ----------------------

  /**
   * Find all recipes (admin)
   */
  async findAll() {
    return this.prisma.recipe.findMany({
      include: recipeAuthorInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find recipe by ID (admin)
   */
  async findByIdWithAuthor(id) {
    return this.prisma.recipe.findUnique({
      where: { id },
      include: recipeAuthorInclude,
    });
  }

  /**
   * Create recipe
   */
  async createRecipe(data) {
    return this.prisma.recipe.create({
      data,
      include: recipeAuthorInclude,
    });
  }

  /**
   * Update recipe
   */
  async updateRecipe(id, data) {
    return this.prisma.recipe.update({
      where: { id },
      data,
      include: recipeAuthorInclude,
    });
  }

  /**
   * Delete recipe
   */
  async deleteRecipe(id) {
    return this.prisma.recipe.delete({
      where: { id },
    });
  }

  /**
   * Check if slug exists (excluding specific ID)
   */
  async slugExists(slug, excludeId = null) {
    const existing = await this.prisma.recipe.findUnique({
      where: { slug },
      select: { id: true },
    });
    return existing && (!excludeId || existing.id !== excludeId);
  }
}
