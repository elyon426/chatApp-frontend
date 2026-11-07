// Single source of truth for how user input is stored and compared.
// Every place that saves or matches a user (registration, contact sync,
// local SQLite, and what we send to the server) must go through these.

export const DEFAULT_COUNTRY_CODE = '254'; // Kenya

/**
 * Turn any phone format into E.164 (+254712345678), or return null if it
 * cannot be a real number. All of these give the same result:
 *   0712 345 678 | 712345678 | 254712345678 | +254 712-345-678
 *   +254 (0)712 345 678 | 00254712345678
 */
export function normalizePhone(raw, defaultCc = DEFAULT_COUNTRY_CODE) {
  if (raw == null) return null;

  // Keep digits and a leading +; drop spaces, dashes, brackets, dots, etc.
  let n = String(raw).trim().replace(/[^\d+]/g, '');
  if (n.includes('+')) n = (n.startsWith('+') ? '+' : '') + n.replace(/\+/g, '');
  if (!n) return null;

  if (n.startsWith('00')) n = '+' + n.slice(2); // 00254... -> +254...

  if (n.startsWith('+')) {
    // "+254 (0)712..." -> drop the optional trunk 0 after the country code
    if (n.startsWith(`+${defaultCc}0`)) n = `+${defaultCc}${n.slice(defaultCc.length + 2)}`;
  } else if (n.startsWith(defaultCc) && n.length >= defaultCc.length + 9) {
    n = '+' + n; // 254712345678
  } else if (n.startsWith('0')) {
    n = `+${defaultCc}${n.slice(1)}`; // 0712345678
  } else {
    n = `+${defaultCc}${n}`; // 712345678
  }

  // E.164: + followed by 8 to 15 digits, first digit non-zero
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

export function isValidPhone(raw) {
  return normalizePhone(raw) !== null;
}

/** "  john   DOE " -> "John Doe" (display name only; never used for matching). */
export function normalizeName(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** IDs can arrive as number or string depending on the source; compare as strings. */
export function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}
