/** Format a number with commas: 1000000 → "1,000,000" */
export function formatNumber(n: number): string {
  return n.toLocaleString('th-TH');
}

/** Format money: 1000000 → "1,000,000 บาท" */
export function formatMoney(n: number): string {
  return `${formatNumber(n)} บาท`;
}

/** Parse Thai-formatted number: "1,000,000" → 1000000 */
export function parseThaiNumber(s: string): number {
  return Number(s.replace(/,/g, '').replace(/\s/g, '')) || 0;
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
  // Already a bare ID
  if (!urlOrId.includes('/')) return urlOrId;
  // URL formats: /file/d/FILE_ID/..., id=FILE_ID
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                urlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId;
}
