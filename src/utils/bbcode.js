const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(input = "") {
  return String(input).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);
}

function sanitizeHref(href) {
  const value = String(href || "").trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value)) return escapeHtml(value);
  if (value.startsWith("mailto:")) return escapeHtml(value);
  return null;
}

function sanitizeSrc(src) {
  const value = String(src || "").trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value)) return escapeHtml(value);
  if (value.startsWith("data:image/")) return escapeHtml(value);
  return null;
}

function replaceSimpleTag(html, tag, open, close) {
  const pattern = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "gi");
  return html.replace(pattern, (_match, inner) => `${open}${inner}${close}`);
}

export function bbcodeToHtml(input = "") {
  if (!input) return "";
  let html = escapeHtml(input);

  const replacements = [
    { tag: "b", open: "<strong>", close: "</strong>" },
    { tag: "strong", open: "<strong>", close: "</strong>" },
    { tag: "i", open: "<em>", close: "</em>" },
    { tag: "em", open: "<em>", close: "</em>" },
    { tag: "u", open: "<u>", close: "</u>" },
    { tag: "s", open: "<s>", close: "</s>" },
    { tag: "quote", open: '<blockquote class="bb-quote">', close: "</blockquote>" },
    { tag: "code", open: '<pre class="bb-code">', close: "</pre>" },
  ];

  for (const { tag, open, close } of replacements) {
    html = replaceSimpleTag(html, tag, open, close);
  }

  html = html.replace(/\[url(?:=([^\]]+))?\]([\s\S]*?)\[\/url\]/gi, (_match, hrefParam, text) => {
    const safeHref = sanitizeHref(hrefParam || text);
    const safeText = text ? text.trim() : "";
    const display = safeText ? escapeHtml(safeText) : safeHref || "";
    if (!safeHref) return display;
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${display || safeHref}</a>`;
  });

  html = html.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, value) => {
    const safeSrc = sanitizeSrc(value);
    if (!safeSrc) return "";
    return `<img src="${safeSrc}" alt="" loading="lazy" class="bb-image" />`;
  });

  html = html.replace(/\[br\]/gi, "<br />");

  html = html.replace(/\n{2,}/g, "<br /><br />").replace(/\n/g, "<br />");

  return html;
}

export function bbcodeToText(input = "") {
  return String(input)
    .replace(/\[(?:\/)?[a-z]+(?:=[^\]]+)?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
