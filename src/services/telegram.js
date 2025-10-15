import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { BusinessLogicError } from "../core/errors/AppError.js";

// Создаем совместимую обертку для File API
const FileAPI = class File extends Blob {
  constructor(bits, name, options = {}) {
    super(bits, options);
    this.name = name;
    this.lastModified = Date.now();
  }
};

const { TELEGRAM_BOT_TOKEN } = process.env;

async function ensureFetch() {
  if (typeof fetch === "function") return fetch;
  const { default: nodeFetch } = await import("node-fetch");
  return nodeFetch;
}

export function verifyTelegramLogin(authData, botToken = TELEGRAM_BOT_TOKEN) {
  const { hash, ...data } = authData || {};
  if (!hash || !botToken) return false;

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const checkString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");
  return hmac === hash;
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) {
    throw new BusinessLogicError(
      "Telegram bot token is not configured",
      "TELEGRAM_NOT_CONFIGURED"
    );
  }
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || options.parseMode || "HTML",
  };

  if (options.threadId) {
    body.message_thread_id = options.threadId;
  }

  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new BusinessLogicError(
      `Failed to send Telegram message: ${res.status}`,
      "TELEGRAM_SEND_FAILED",
      { status: res.status, response: bodyText }
    );
  }

  const result = await res.json();
  return result;
}
export async function sendTelegramPhoto(
  chatId,
  photoPath,
  caption,
  options = {}
) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) {
    throw new BusinessLogicError(
      "Telegram bot token is not configured",
      "TELEGRAM_NOT_CONFIGURED"
    );
  }
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const isUrl =
    typeof photoPath === "string" && /^https?:\/\//i.test(photoPath);

  let res;
  if (isUrl) {
    const body = {
      chat_id: chatId,
      photo: photoPath,
      parse_mode: options.parse_mode || options.parseMode || "HTML",
    };
    if (caption) body.caption = caption;
    if (options.threadId) body.message_thread_id = options.threadId;

    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    // Используем встроенный FormData (Node.js 20+)
    const formData = new FormData();
    formData.append("chat_id", String(chatId));

    // Читаем файл в Buffer и создаем File объект (Node.js 20+)
    const fileBuffer = await fs.readFile(photoPath);
    const fileName = path.basename(photoPath);

    // Создаем File объект (Node.js 20+) или Blob с именем (fallback)
    const file = new FileAPI([fileBuffer], fileName, { type: "image/jpeg" });
    formData.append("photo", file, fileName);

    if (caption) formData.append("caption", caption);
    formData.append("parse_mode", options.parseMode || "HTML");
    if (options.threadId)
      formData.append("message_thread_id", String(options.threadId));

    res = await fetchImpl(url, {
      method: "POST",
      body: formData,
    });
  }

  if (!res.ok) {
    const bodyText = await res.text();
    throw new BusinessLogicError(
      `Failed to send Telegram photo: ${res.status}`,
      "TELEGRAM_SEND_PHOTO_FAILED",
      { status: res.status, response: bodyText }
    );
  }

  const result = await res.json();
  return result;
}

export async function sendTelegramMediaGroup(chatId, mediaGroup, options = {}) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) {
    throw new BusinessLogicError(
      "Telegram bot token is not configured",
      "TELEGRAM_NOT_CONFIGURED"
    );
  }

  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;

  // Используем FormData для отправки файлов
  const formData = new FormData();
  formData.append("chat_id", String(chatId));

  if (options.threadId) {
    formData.append("message_thread_id", String(options.threadId));
  }

  // Подготавливаем медиа-группу
  const media = [];
  for (let i = 0; i < mediaGroup.length; i++) {
    const item = mediaGroup[i];
    const mediaItem = {
      type: item.type,
      media: `attach://file_${i}`,
    };

    if (item.caption) {
      mediaItem.caption = item.caption;
    }

    media.push(mediaItem);

    // Добавляем файл
    const fileBuffer = await fs.readFile(item.media.source);
    const fileName = path.basename(item.media.source);
    const file = new FileAPI([fileBuffer], fileName, { type: "image/jpeg" });
    formData.append(`file_${i}`, file, fileName);
  }

  formData.append("media", JSON.stringify(media));
  formData.append(
    "parse_mode",
    options.parse_mode || options.parseMode || "HTML"
  );

  const res = await fetchImpl(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new BusinessLogicError(
      `Telegram API error: ${res.status} ${errorText}`,
      "TELEGRAM_API_ERROR"
    );
  }

  const result = await res.json();
  return result;
}

export async function editTelegramMessage(
  chatId,
  messageId,
  text,
  options = {}
) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) {
    throw new BusinessLogicError(
      "Telegram bot token is not configured",
      "TELEGRAM_NOT_CONFIGURED"
    );
  }
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/editMessageText`;

  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parseMode || "HTML",
  };

  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    // Если прошло 48 часов, Telegram вернет ошибку
    if (
      bodyText.includes("message can't be edited") ||
      bodyText.includes("message to edit not found")
    ) {
      throw new BusinessLogicError(
        "Message is too old to edit (48 hours limit)",
        "MESSAGE_TOO_OLD"
      );
    }
    throw new BusinessLogicError(
      `Failed to edit Telegram message: ${res.status}`,
      "TELEGRAM_EDIT_FAILED",
      { status: res.status, response: bodyText }
    );
  }

  const result = await res.json();
  return result;
}

export async function editTelegramMessageMedia(
  chatId,
  messageId,
  photoPath,
  caption,
  options = {}
) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) {
    throw new BusinessLogicError(
      "Telegram bot token is not configured",
      "TELEGRAM_NOT_CONFIGURED"
    );
  }
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/editMessageMedia`;
  const isUrl =
    typeof photoPath === "string" && /^https?:\/\//i.test(photoPath);

  let res;
  if (isUrl) {
    // Если photoPath - это URL, используем его напрямую
    const media = {
      type: "photo",
      media: photoPath,
    };
    if (caption) {
      media.caption = caption;
      media.parse_mode = options.parseMode || "HTML";
    }

    const body = {
      chat_id: chatId,
      message_id: messageId,
      media: media,
    };

    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    // Если photoPath - это локальный файл
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("message_id", String(messageId));

    const media = {
      type: "photo",
      media: "attach://photo",
    };
    if (caption) {
      media.caption = caption;
      media.parse_mode = options.parseMode || "HTML";
    }

    formData.append("media", JSON.stringify(media));

    // Читаем файл в Buffer и создаем File объект (Node.js 20+) или Blob (fallback)
    const fileBuffer = await fs.readFile(photoPath);
    const fileName = path.basename(photoPath);
    const file = new FileAPI([fileBuffer], fileName, { type: "image/jpeg" });
    formData.append("photo", file, fileName);

    res = await fetchImpl(url, {
      method: "POST",
      body: formData,
    });
  }

  if (!res.ok) {
    const bodyText = await res.text();
    if (
      bodyText.includes("message can't be edited") ||
      bodyText.includes("message to edit not found")
    ) {
      throw new BusinessLogicError(
        "Message is too old to edit (48 hours limit)",
        "MESSAGE_TOO_OLD"
      );
    }
    throw new BusinessLogicError(
      `Failed to edit Telegram message media: ${res.status}`,
      "TELEGRAM_EDIT_MEDIA_FAILED",
      { status: res.status, response: bodyText }
    );
  }

  const result = await res.json();
  return result;
}

export async function deleteTelegramMessage(chatId, messageId) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) {
    throw new BusinessLogicError(
      "Telegram bot token is not configured",
      "TELEGRAM_NOT_CONFIGURED"
    );
  }
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/deleteMessage`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    // Игнорируем ошибку если сообщение уже удалено
    if (!bodyText.includes("message to delete not found")) {
      throw new BusinessLogicError(
        `Failed to delete Telegram message: ${res.status}`,
        "TELEGRAM_DELETE_FAILED",
        { status: res.status, response: bodyText }
      );
    }
  }

  return true;
}

export function buildTelegramMessage(message) {
  return String(message || "").trim();
}
