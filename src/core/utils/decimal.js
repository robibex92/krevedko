import Decimal from "decimal.js";

/**
 * Create Decimal instance
 */
export function dec(value) {
  return new Decimal(value);
}

/**
 * Check if value is multiple of step
 */
export function isMultipleOf(value, step) {
  const val = dec(value);
  const stepDec = dec(step);
  return val.mod(stepDec).eq(0);
}

/**
 * Round to step
 */
export function roundToStep(value, step) {
  const val = dec(value);
  const stepDec = dec(step);
  return val.div(stepDec).round().mul(stepDec);
}

/**
 * Format decimal as string
 */
export function formatDecimal(value, precision = 2) {
  return dec(value).toFixed(precision);
}

/**
 * Convert kopecks to rubles
 */
export function kopecksToRubles(kopecks) {
  return dec(kopecks).div(100);
}

/**
 * Convert rubles to kopecks
 */
export function rublesToKopecks(rubles) {
  return dec(rubles).mul(100).toNumber();
}

/**
 * Format price
 */
export function formatPrice(kopecks) {
  const rubles = kopecksToRubles(kopecks);
  return `${rubles.toFixed(2)} ₽`;
}
