/**
 * Money helpers shared by the cart / checkout / order-summary screens.
 *
 * Cart items historically stored `price` only as a localized display STRING
 * (e.g. "1 800 €"). Parsing that back into a number to compute totals is
 * fragile — naively stripping non-digits turns a European decimal like
 * "1 800,50 €" into 180050. These helpers parse robustly and format the
 * backend-authoritative cents amount consistently.
 */

/**
 * Parse a localized price string into a number of currency units (euros).
 * Handles the app's own "1 800 €" / "1800 EUR" format plus European
 * ("1.800,50") and US ("1,800.50") groupings. Returns 0 when unparseable.
 */
export function priceStringToNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;

  // Drop spaces (the app's thousands separator) and any currency text/symbols,
  // keeping only digits and the two possible separators.
  let s = String(raw).replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Both separators present → the rightmost one is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Only commas. "1,800" (3 trailing digits, grouped) is thousands; otherwise
    // treat the comma as a decimal separator ("1800,50").
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  // Only dots (or none): the app never emits dot-thousands, so a dot is decimal.

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a backend cents amount as a display string with space thousands
 * separators and 2 decimals, e.g. (181500, "eur") -> "1 815.00 EUR".
 */
export function formatCents(cents: number, currency: string = 'eur'): string {
  const value = Number.isFinite(cents) ? cents / 100 : 0;
  const [intPart, dec] = value.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped}.${dec} ${(currency || 'eur').toUpperCase()}`;
}
