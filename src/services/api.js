import { BusinessLogicError } from "../core/errors/AppError.js";

async function ensureFetch() {
  if (typeof fetch === "function") return fetch;
  const { default: nodeFetch } = await import("node-fetch");
  return nodeFetch;
}

export async function apiFetchJson(pathname, options = {}) {
  const { API_URL } = process.env;
  if (!API_URL) {
    throw new BusinessLogicError(
      "API URL is not configured",
      "API_URL_NOT_CONFIGURED"
    );
  }
  const fetchImpl = await ensureFetch();
  const url = `${API_URL.replace(/\/$/, "")}/${String(pathname).replace(
    /^\//,
    ""
  )}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const res = await fetchImpl(url, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new BusinessLogicError(
      `API request failed: ${res.status}`,
      "API_REQUEST_FAILED",
      { status: res.status, body: data }
    );
  }
  return data;
}

export const api = { fetchJson: apiFetchJson };
