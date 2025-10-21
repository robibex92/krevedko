export class SiteContentController {
  constructor(prisma) {
    this.prisma = prisma;

    // Привязываем контекст this к методам
    this.getSiteContent = this.getSiteContent.bind(this);
    this.updateSiteContent = this.updateSiteContent.bind(this);
    this.getFAQItems = this.getFAQItems.bind(this);
    this.createFAQItem = this.createFAQItem.bind(this);
    this.updateFAQItem = this.updateFAQItem.bind(this);
    this.deleteFAQItem = this.deleteFAQItem.bind(this);
    this.reorderFAQItems = this.reorderFAQItems.bind(this);
  }
  /**
   * Получить весь контент сайта
   */
  async getSiteContent(req, res) {
    try {
      if (!this.prisma) {
        return res.status(500).json({
          success: false,
          message: "Prisma client not initialized",
        });
      }

      // Проверяем, существуют ли таблицы
      let content = [];
      let faqItems = [];

      try {
        content = await this.prisma.siteContent.findMany({
          where: { isActive: true },
          orderBy: { key: "asc" },
        });
      } catch (error) {
        // Таблица не существует, используем пустой массив
      }

      try {
        faqItems = await this.prisma.fAQItem.findMany({
          where: { isActive: true },
          orderBy: { order: "asc" },
        });
      } catch (error) {
        // Таблица не существует, используем пустой массив
      }

      // Преобразуем в удобный формат
      const contentMap = {};
      content.forEach((item) => {
        contentMap[item.key] = {
          id: item.id,
          title: item.title,
          content: item.content,
        };
      });

      res.json({
        success: true,
        data: {
          about: contentMap.about || null,
          contacts: contentMap.contacts || null,
          faq: faqItems,
        },
      });
    } catch (error) {
      console.error("Error getting site content:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при получении контента сайта",
        error: error.message,
      });
    }
  }

  /**
   * Обновить контент сайта (О нас, Контакты)
   */
  async updateSiteContent(req, res) {
    try {
      const { key, title, content } = req.body;

      if (!key || !title || content === undefined) {
        return res.status(400).json({
          success: false,
          message: "Необходимо указать key, title и content",
        });
      }

      if (!["about", "contacts"].includes(key)) {
        return res.status(400).json({
          success: false,
          message: "Недопустимый ключ контента",
        });
      }

      const updatedContent = await this.prisma.siteContent.upsert({
        where: { key },
        update: {
          title,
          content,
          updatedAt: new Date(),
        },
        create: {
          key,
          title,
          content,
        },
      });

      res.json({
        success: true,
        data: updatedContent,
        message: "Контент успешно обновлен",
      });
    } catch (error) {
      console.error("Error updating site content:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при обновлении контента",
        error: error.message,
      });
    }
  }

  /**
   * Получить все FAQ элементы
   */
  async getFAQItems(req, res) {
    try {
      const faqItems = await this.prisma.fAQItem.findMany({
        orderBy: { order: "asc" },
      });

      res.json({
        success: true,
        data: faqItems,
      });
    } catch (error) {
      console.error("Error getting FAQ items:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при получении FAQ",
        error: error.message,
      });
    }
  }

  /**
   * Создать новый FAQ элемент
   */
  async createFAQItem(req, res) {
    try {
      const { question, answer, order = 0 } = req.body;

      if (!question || !answer) {
        return res.status(400).json({
          success: false,
          message: "Необходимо указать вопрос и ответ",
        });
      }

      const faqItem = await this.prisma.fAQItem.create({
        data: {
          question,
          answer,
          order: parseInt(order) || 0,
        },
      });

      res.status(201).json({
        success: true,
        data: faqItem,
        message: "FAQ элемент создан",
      });
    } catch (error) {
      console.error("Error creating FAQ item:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при создании FAQ элемента",
        error: error.message,
      });
    }
  }

  /**
   * Обновить FAQ элемент
   */
  async updateFAQItem(req, res) {
    try {
      const { id } = req.params;
      const { question, answer, order, isActive } = req.body;

      const updateData = {};
      if (question !== undefined) updateData.question = question;
      if (answer !== undefined) updateData.answer = answer;
      if (order !== undefined) updateData.order = parseInt(order);
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      const faqItem = await this.prisma.fAQItem.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      res.json({
        success: true,
        data: faqItem,
        message: "FAQ элемент обновлен",
      });
    } catch (error) {
      console.error("Error updating FAQ item:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при обновлении FAQ элемента",
        error: error.message,
      });
    }
  }

  /**
   * Удалить FAQ элемент
   */
  async deleteFAQItem(req, res) {
    try {
      const { id } = req.params;

      await this.prisma.fAQItem.delete({
        where: { id: parseInt(id) },
      });

      res.json({
        success: true,
        message: "FAQ элемент удален",
      });
    } catch (error) {
      console.error("Error deleting FAQ item:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при удалении FAQ элемента",
        error: error.message,
      });
    }
  }

  /**
   * Изменить порядок FAQ элементов
   */
  async reorderFAQItems(req, res) {
    try {
      const { items } = req.body; // [{ id, order }, ...]

      if (!Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          message: "Необходимо передать массив элементов с id и order",
        });
      }

      // Обновляем порядок для всех элементов
      const updatePromises = items.map((item) =>
        this.prisma.fAQItem.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      );

      await Promise.all(updatePromises);

      res.json({
        success: true,
        message: "Порядок FAQ элементов обновлен",
      });
    } catch (error) {
      console.error("Error reordering FAQ items:", error);
      res.status(500).json({
        success: false,
        message: "Ошибка при изменении порядка FAQ элементов",
        error: error.message,
      });
    }
  }
}
