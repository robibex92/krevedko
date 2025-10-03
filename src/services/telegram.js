import crypto from "crypto";

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

export async function sendTelegramMessage(chatId, text) {
  const { TELEGRAM_BOT_TOKEN: token } = process.env;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const fetchImpl = await ensureFetch();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TELEGRAM_SEND_FAILED:${res.status}:${body}`);
  }
}

export function buildTelegramMessage(message) {
  const body = String(message || "").trim();
  const parts = ["Здравствуйте!", body, "С уважением, Ля Креведко"];
  return parts.filter(Boolean).join("\n\n");
}
