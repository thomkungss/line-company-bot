/** Format a number with commas: 1000000 → "1,000,000" */
export function formatNumber(n: number): string {
  return n.toLocaleString('th-TH');
}

/** Format money: 1000000 → "1,000,000 บาท" */
export function formatMoney(n: number): string {
  return `${formatNumber(n)} บาท`;
}

/** Parse Thai-formatted number: "1,000,000 บาท" → 1000000 */
export function parseThaiNumber(s: string): number {
  // Strip commas, Thai text (บาท, หุ้น, คน), and whitespace
  const cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
  return Number(cleaned) || 0;
}

/** Get current timestamp in Thai timezone ISO string */
export function thaiNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace(' ', 'T');
}

/** Truncate string to maxLen with ellipsis */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/** Check if a sheet name is a special system sheet (starts with _) */
export function isSpecialSheet(name: string): boolean {
  return name.startsWith('_');
}

/** Extract Google Drive file ID from a full URL */
export function extractDriveFileId(urlOrId: string): string {
  if (!urlOrId) return '';
  // Already a bare ID (no slashes, no protocol)
  if (!urlOrId.includes('/')) return urlOrId;
  // URL formats: /file/d/FILE_ID/..., id=FILE_ID
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                urlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  // Return empty for non-Drive URLs (e.g. local upload URLs)
  return match ? match[1] : '';
}
