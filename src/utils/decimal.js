import Decimal from "decimal.js";

/**
 * Parse any numeric input to Decimal. Throws on invalid.
 * @param {string|number} v
 * @returns {Decimal}
 */
export function dec(v) {
  if (v === null || v === undefined || v === "")
    throw new Error("INVALID_DECIMAL");
  return new Decimal(v);
}

/**
 * Check that value is a positive multiple of step (value > 0 and value % step === 0)
 * @param {string|number|Decimal} value
 * @param {string|number|Decimal} step
 * @returns {boolean}
 */
export function isMultipleOf(value, step) {
  const a = dec(value);
  const s = dec(step);
  if (a.lte(0)) return false;
  if (s.lte(0)) return false;
  // v / step should be integer
  const q = a.div(s);
  return q.isInteger();
}

/**
 * Format Decimal to normalized string without trailing zeros.
 * @param {string|number|Decimal} v
 * @returns {string}
 */
export function norm(v) {
  return dec(v).toSignificantDigits(20).toString();
}

export default { dec, isMultipleOf, norm };
