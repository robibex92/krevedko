const CYRILLIC_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export const RECIPE_STATUSES = new Set(["DRAFT", "PUBLISHED"]);

export function slugifyRecipeSlug(input) {
  if (!input) return "recipe";
  const lower = String(input).toLowerCase();
  let result = "";
  for (const char of lower) {
    if (/[a-z0-9]/.test(char)) {
      result += char;
      continue;
    }
    if (CYRILLIC_MAP[char]) {
      result += CYRILLIC_MAP[char];
      continue;
    }
    if (/[0-9]/.test(char)) {
      result += char;
      continue;
    }
    result += "-";
  }
  result = result.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!result) return "recipe";
  return result.slice(0, 96);
}

export async function ensureRecipeSlug(prisma, desiredSlug, excludeId = null) {
  const base = slugifyRecipeSlug(desiredSlug);
  let candidate = base;
  let counter = 1;
  while (true) {
    const existing = await prisma.recipe.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    counter += 1;
    candidate = `${base}-${counter}`;
  }
}

export function sanitizeMediaPath(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  let clean = raw.replace(/^https?:\/\/[^\s]+$/i, (url) => url); // keep absolute urls as-is
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }
  clean = raw.replace(/^\/+/, "").replace(/^uploads\//, "");
  if (clean.includes("..")) throw new Error("INVALID_MEDIA_PATH");
  return clean;
}

function sanitizeExternalUrl(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (!/^https?:\/\//i.test(str)) throw new Error("INVALID_MEDIA_URL");
  return str;
}

export function normalizeRecipeContent(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { blocks: [] };
  }
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error("INVALID_CONTENT_JSON");
    }
  }
  const blocksSource = Array.isArray(data)
    ? data
    : Array.isArray(data?.blocks)
    ? data.blocks
    : [];
  if (!Array.isArray(blocksSource)) {
    throw new Error("INVALID_CONTENT_BLOCKS");
  }
  const normalizedBlocks = blocksSource.map((block, index) => {
    if (!block || typeof block !== "object") {
      throw new Error(`INVALID_BLOCK_${index}`);
    }
    const type = typeof block.type === "string" ? block.type.trim().toLowerCase() : "";
    switch (type) {
      case "text": {
        const text = block.text !== undefined ? String(block.text) : "";
        return {
          type: "text",
          text,
          align: block.align && ["left", "right", "center", "justify"].includes(block.align)
            ? block.align
            : "left",
        };
      }
      case "heading": {
        const text = block.text !== undefined ? String(block.text).trim() : "";
        const levelNum = Number(block.level);
        const level = [1, 2, 3, 4].includes(levelNum) ? levelNum : 2;
        return {
          type: "heading",
          text,
          level,
        };
      }
      case "image": {
        const path = block.path ? sanitizeMediaPath(block.path) : null;
        const url = sanitizeExternalUrl(block.url);
        if (!path && !url) throw new Error(`IMAGE_BLOCK_NEEDS_PATH_OR_URL_${index}`);
        return {
          type: "image",
          path,
          url,
          alt: block.alt !== undefined ? String(block.alt) : null,
          caption: block.caption !== undefined ? String(block.caption) : null,
        };
      }
      case "video": {
        const path = block.path ? sanitizeMediaPath(block.path) : null;
        const url = sanitizeExternalUrl(block.url);
        if (!path && !url) throw new Error(`VIDEO_BLOCK_NEEDS_PATH_OR_URL_${index}`);
        return {
          type: "video",
          path,
          url,
          caption: block.caption !== undefined ? String(block.caption) : null,
          autoplay: Boolean(block.autoplay),
          controls: block.controls === false ? false : true,
        };
      }
      case "quote": {
        const text = block.text !== undefined ? String(block.text) : "";
        const author = block.author !== undefined ? String(block.author) : null;
        return {
          type: "quote",
          text,
          author,
        };
      }
      default:
        throw new Error(`UNSUPPORTED_BLOCK_TYPE_${type || "UNKNOWN"}`);
    }
  });
  return { blocks: normalizedBlocks };
}

export function recipeAuthorSummary(author) {
  if (!author) return null;
  const nameParts = [author.firstName, author.lastName].filter(Boolean);
  const display = nameParts.join(" ") || author.name || author.email || null;
  return {
    id: author.id,
    name: display,
    firstName: author.firstName ?? null,
    lastName: author.lastName ?? null,
    email: author.email ?? null,
  };
}

export function toRecipeSummary(recipe) {
  const blocksCount = Array.isArray(recipe?.content?.blocks)
    ? recipe.content.blocks.length
    : 0;
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    excerpt: recipe.excerpt ?? null,
    coverImagePath: recipe.coverImagePath ?? null,
    status: recipe.status,
    publishedAt: recipe.publishedAt,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    blocksCount,
    author: recipeAuthorSummary(recipe.author),
  };
}

export function toRecipeDetail(recipe) {
  return {
    ...toRecipeSummary(recipe),
    content: {
      blocks: Array.isArray(recipe?.content?.blocks)
        ? recipe.content.blocks.map((block) => ({ ...block }))
        : [],
    },
  };
}

export const recipeAuthorInclude = {
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
