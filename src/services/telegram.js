import crypto from "crypto";
import FormData from "form-data";
import fs from "fs";
import path from "path";

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
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const body = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || "HTML",
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
    const body = await res.text();
    throw new Error(`TELEGRAM_SEND_FAILED:${res.status}:${body}`);
  }
  
  const result = await res.json();
  return result;
}
export async function sendTelegramPhoto(chatId, photoPath, caption, options = {}) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const isUrl = typeof photoPath === "string" && /^https?:\/\//i.test(photoPath);

  let res;
  if (isUrl) {
    const body = {
      chat_id: chatId,
      photo: photoPath,
      parse_mode: options.parseMode || "HTML",
    };
    if (caption) body.caption = caption;
    if (options.threadId) body.message_thread_id = options.threadId;

    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("photo", fs.createReadStream(photoPath));
    if (caption) formData.append("caption", caption);
    formData.append("parse_mode", options.parseMode || "HTML");
    if (options.threadId) formData.append("message_thread_id", options.threadId);

    res = await fetchImpl(url, {
      method: "POST",
      body: formData,
      headers: formData.getHeaders(),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TELEGRAM_SEND_PHOTO_FAILED:${res.status}:${body}`);
  }
  
  const result = await res.json();
  return result;
}

export async function editTelegramMessage(chatId, messageId, text, options = {}) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
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
    if (bodyText.includes("message can't be edited") || bodyText.includes("message to edit not found")) {
      throw new Error("MESSAGE_TOO_OLD");
    }
    throw new Error(`TELEGRAM_EDIT_FAILED:${res.status}:${bodyText}`);
  }
  
  const result = await res.json();
  return result;
}

export async function editTelegramMessageMedia(chatId, messageId, photoPath, caption, options = {}) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/editMessageMedia`;
  
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("message_id", messageId);
  
  const media = {
    type: "photo",
    media: "attach://photo",
  };
  if (caption) {
    media.caption = caption;
    media.parse_mode = options.parseMode || "HTML";
  }
  
  formData.append("media", JSON.stringify(media));
  formData.append("photo", fs.createReadStream(photoPath));
  
  const res = await fetchImpl(url, {
    method: "POST",
    body: formData,
    headers: formData.getHeaders(),
  });
  
  if (!res.ok) {
    const bodyText = await res.text();
    if (bodyText.includes("message can't be edited") || bodyText.includes("message to edit not found")) {
      throw new Error("MESSAGE_TOO_OLD");
    }
    throw new Error(`TELEGRAM_EDIT_MEDIA_FAILED:${res.status}:${bodyText}`);
  }
  
  const result = await res.json();
  return result;
}

export async function deleteTelegramMessage(chatId, messageId) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/deleteMessage`;
  
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
  
  if (!res.ok) {
    const body = await res.text();
    // Игнорируем ошибку если сообщение уже удалено
    if (!body.includes("message to delete not found")) {
      throw new Error(`TELEGRAM_DELETE_FAILED:${res.status}:${body}`);
    }
  }
  
  return true;
}

export function buildTelegramMessage(message) {
  const body = String(message || "").trim();
  const parts = ["Здравствуйте!", body, "С уважением, Ля Креведко"];
  return parts.filter(Boolean).join("\n\n");
}
