import { DatabaseError, NotFoundError } from "../errors/AppError.js";

/**
 * Base repository class with common CRUD operations
 */
export class BaseRepository {
  constructor(prisma, modelName) {
    this.prisma = prisma;
    this.modelName = modelName;
    this.model = prisma[modelName];

    if (!this.model) {
      throw new Error(`Model ${modelName} not found in Prisma client`);
    }
  }

  /**
   * Find by ID
   */
  async findById(id, options = {}) {
    try {
      const record = await this.model.findUnique({
        where: { id },
        ...options,
      });
      return record;
    } catch (error) {
      console.error(`[BaseRepository] Failed to find ${this.modelName} by id:`, {
        id,
        idType: typeof id,
        error: error.message,
      });
      throw new DatabaseError(`Failed to find ${this.modelName} by id: ${id} (type: ${typeof id})`, error);
    }
  }

  /**
   * Find by ID or throw
   */
  async findByIdOrFail(id, options = {}) {
    const record = await this.findById(id, options);
    if (!record) {
      throw new NotFoundError(this.modelName, id);
    }
    return record;
  }

  /**
   * Find one by criteria
   */
  async findOne(where, options = {}) {
    try {
      return await this.model.findFirst({
        where,
        ...options,
      });
    } catch (error) {
      throw new DatabaseError(`Failed to find ${this.modelName}`, error);
    }
  }

  /**
   * Find one or throw
   */
  async findOneOrFail(where, options = {}) {
    const record = await this.findOne(where, options);
    if (!record) {
      throw new NotFoundError(this.modelName);
    }
    return record;
  }

  /**
   * Find many
   */
  async findMany(where = {}, options = {}) {
    try {
      return await this.model.findMany({
        where,
        ...options,
      });
    } catch (error) {
      throw new DatabaseError(
        `Failed to find ${this.modelName} records`,
        error
      );
    }
  }

  /**
   * Find with pagination
   */
  async findWithPagination(
    where = {},
    { page = 1, limit = 20, orderBy = { id: "desc" }, ...options } = {}
  ) {
    try {
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.model.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          ...options,
        }),
        this.model.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new DatabaseError(`Failed to paginate ${this.modelName}`, error);
    }
  }

  /**
   * Create
   */
  async create(data, options = {}) {
    try {
      return await this.model.create({
        data,
        ...options,
      });
    } catch (error) {
      throw new DatabaseError(`Failed to create ${this.modelName}`, error);
    }
  }

  /**
   * Update
   */
  async update(id, data, options = {}) {
    try {
      return await this.model.update({
        where: { id },
        data,
        ...options,
      });
    } catch (error) {
      throw new DatabaseError(`Failed to update ${this.modelName}`, error);
    }
  }

  /**
   * Update many
   */
  async updateMany(where, data) {
    try {
      return await this.model.updateMany({
        where,
        data,
      });
    } catch (error) {
      throw new DatabaseError(
        `Failed to update ${this.modelName} records`,
        error
      );
    }
  }

  /**
   * Delete
   */
  async delete(id) {
    try {
      return await this.model.delete({
        where: { id },
      });
    } catch (error) {
      throw new DatabaseError(`Failed to delete ${this.modelName}`, error);
    }
  }

  /**
   * Delete many
   */
  async deleteMany(where) {
    try {
      return await this.model.deleteMany({
        where,
      });
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete ${this.modelName} records`,
        error
      );
    }
  }

  /**
   * Count
   */
  async count(where = {}) {
    try {
      return await this.model.count({ where });
    } catch (error) {
      throw new DatabaseError(`Failed to count ${this.modelName}`, error);
    }
  }

  /**
   * Exists
   */
  async exists(where) {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Upsert
   */
  async upsert(where, create, update, options = {}) {
    try {
      return await this.model.upsert({
        where,
        create,
        update,
        ...options,
      });
    } catch (error) {
      throw new DatabaseError(`Failed to upsert ${this.modelName}`, error);
    }
  }
}
