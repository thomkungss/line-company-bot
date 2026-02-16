import { getSheetsClient, getSpreadsheetId, getDriveClient, getDriveFolderId } from './google-auth';
import {
  Company, Director, Shareholder, CompanyDocument,
  ShareBreakdown, UserPermission, VersionEntry, ChatLogEntry,
  SPECIAL_SHEETS
} from './types';
import { parseThaiNumber, extractDriveFileId, isSpecialSheet } from './utils';

type SheetRow = (string | undefined)[];

// ===== Simple TTL Cache =====

const cache: Record<string, { data: any; expiry: number }> = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (entry && Date.now() < entry.expiry) return entry.data as T;
  return null;
}

function setCache(key: string, data: any): void {
  cache[key] = { data, expiry: Date.now() + CACHE_TTL };
}

export function clearCache(key?: string): void {
  if (key) { delete cache[key]; } else { Object.keys(cache).forEach(k => delete cache[k]); }
}

// ===== List All Company Sheets =====

export async function listCompanySheets(): Promise<string[]> {
  const cached = getCached<string[]>('companySheets');
  if (cached) return cached;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    fields: 'sheets.properties.title',
  });
  const result = (res.data.sheets || [])
    .map(s => s.properties?.title || '')
    .filter(name => name && !isSpecialSheet(name));
  setCache('companySheets', result);
  return result;
}

// ===== Parse Company Data from Sheet =====

export async function parseCompanySheet(sheetName: string): Promise<Company> {
  const cacheKey = 'company:' + sheetName;
  const cached = getCached<Company>(cacheKey);
  if (cached) return cached;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:Z`,
  });
  const rows: SheetRow[] = res.data.values || [];
  const result = parseRows(sheetName, rows);
  setCache(cacheKey, result);
  return result;
}

function findValue(rows: SheetRow[], label: string, colOffset = 1): string {
  for (const row of rows) {
    const cell = (row[0] || '').toString().trim();
    if (cell === label || cell.includes(label)) {
      return (row[colOffset] || '').toString().trim();
    }
  }
  return '';
}

function findRowIndex(rows: SheetRow[], label: string): number {
  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i][0] || '').toString().trim();
    if (cell === label || cell.includes(label)) return i;
  }
  return -1;
}

function parseRows(sheetName: string, rows: SheetRow[]): Company {
  // Basic fields
  const dataDate = findValue(rows, 'ณ วันที่') || findValue(rows, 'วันที่');
  const companyNameTh = findValue(rows, 'ชื่อบริษัท');
  const companyNameEn = findValue(rows, 'Company Name') || findValue(rows, 'ชื่อภาษาอังกฤษ');
  const registrationNumber = findValue(rows, 'เลขทะเบียนนิติบุคคล') || findValue(rows, 'เลขทะเบียน');

  // Directors
  const directors = parseDirectors(rows);
  const directorCount = directors.length || parseThaiNumber(findValue(rows, 'จำนวนกรรมการ'));

  // Authority
  const authorizedSignatory = findValue(rows, 'อำนาจกรรมการ');

  // Capital
  const capitalText = findValue(rows, 'ทุนจดทะเบียน');
  const registeredCapital = parseThaiNumber(capitalText);

  // Share breakdown
  const shareBreakdown = parseShareBreakdown(rows);

  // Address
  const headOfficeAddress = findValue(rows, 'ที่ตั้งสำนักงานใหญ่') || findValue(rows, 'ที่อยู่');

  // Objectives
  const objectives = findValue(rows, 'วัตถุประสงค์');

  // Seal image — can be a Drive file ID/URL or a full external URL
  const sealRaw = findValue(rows, 'ตราประทับ');
  const isExternalUrl = sealRaw.startsWith('http') && !sealRaw.includes('drive.google.com');
  const sealImageDriveId = isExternalUrl ? '' : extractDriveFileId(sealRaw);
  const sealImageUrl = isExternalUrl ? sealRaw : '';

  // Shareholders
  const shareholders = parseShareholders(rows);

  // Documents
  const documents = parseDocuments(rows);

  return {
    sheetName,
    dataDate: dataDate || '',
    companyNameTh: companyNameTh || sheetName,
    companyNameEn,
    registrationNumber,
    directorCount: directorCount || directors.length,
    directors,
    authorizedSignatory,
    registeredCapital,
    capitalText,
    shareBreakdown,
    headOfficeAddress,
    objectives,
    sealImageDriveId,
    sealImageUrl,
    shareholders,
    documents,
  };
}

function parseDirectors(rows: SheetRow[]): Director[] {
  const directors: Director[] = [];
  const sectionHeaders = ['อำนาจกรรมการ', 'ทุนจดทะเบียน', 'ผู้ถือหุ้น', 'ที่ตั้ง', 'วัตถุ', 'ตราประทับ', 'เอกสาร', 'หมายเหตุ', 'จำนวนหุ้น', 'มูลค่า', 'ชำระ'];

  // Find "กรรมการ" but not "อำนาจกรรมการ" or "จำนวนกรรมการ"
  let startIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i][0] || '').toString().trim();
    if (cell === 'กรรมการ' || (cell.includes('กรรมการ') && !cell.includes('อำนาจ') && !cell.includes('จำนวน'))) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return directors;

  // First director might be on the same row — skip count text like "3 คน"
  const firstVal = (rows[startIdx][1] || '').toString().trim();
  if (firstVal && !firstVal.match(/^\d+(\s*คน)?$/)) {
    directors.push({ name: firstVal, position: (rows[startIdx][2] || '').toString().trim() || undefined });
  }

  // Subsequent rows until we hit the next section
  for (let i = startIdx + 1; i < rows.length; i++) {
    const labelCell = (rows[i][0] || '').toString().trim();

    // Stop at known section headers
    if (labelCell && sectionHeaders.some(h => labelCell.includes(h))) break;

    // Get name from col B first, then col A
    const colB = (rows[i][1] || '').toString().trim();
    const colA = labelCell;

    // Row with number prefix in col A (e.g. "1.") and name in col B
    if (colA.match(/^\d+\.?$/) && colB && colB !== '-') {
      const position = (rows[i][2] || '').toString().trim() || undefined;
      directors.push({ name: colB.replace(/^\d+\.?\s*/, ''), position });
      continue;
    }

    // Name directly in col A (e.g. "นายสมชาย ใจดี")
    if (colA && colA !== '-' && !colA.match(/^\d+(\s*คน)?$/) && colA.length > 2) {
      const position = (colB || (rows[i][2] || '').toString().trim()) || undefined;
      directors.push({ name: colA.replace(/^\d+\.?\s*/, ''), position: position || undefined });
      continue;
    }

    // Name in col B with blank/empty col A
    if (!colA && colB && colB !== '-') {
      const position = (rows[i][2] || '').toString().trim() || undefined;
      directors.push({ name: colB.replace(/^\d+\.?\s*/, ''), position });
      continue;
    }
  }
  return directors;
}

function parseShareBreakdown(rows: SheetRow[]): ShareBreakdown {
  const totalSharesStr = findValue(rows, 'จำนวนหุ้น') || findValue(rows, 'หุ้นทั้งหมด');
  const parValueStr = findValue(rows, 'มูลค่าหุ้นละ') || findValue(rows, 'มูลค่าที่ตราไว้');
  const paidUpStr = findValue(rows, 'ชำระแล้ว') || findValue(rows, 'ทุนชำระแล้ว');

  const totalShares = parseThaiNumber(totalSharesStr);
  const parValue = parseThaiNumber(parValueStr) || 100; // default 100 baht
  const paidUpAmount = parseThaiNumber(paidUpStr);

  return {
    totalShares,
    parValue,
    paidUpShares: totalShares,
    paidUpAmount: paidUpAmount || totalShares * parValue,
  };
}

function parseShareholders(rows: SheetRow[]): Shareholder[] {
  const shareholders: Shareholder[] = [];
  const startIdx = findRowIndex(rows, 'ผู้ถือหุ้น');
  if (startIdx < 0) return shareholders;

  let order = 1;
  for (let i = startIdx + 1; i < rows.length; i++) {
    const labelCell = (rows[i][0] || '').toString().trim();
    // Stop at next major section
    if (labelCell && !labelCell.match(/^\d+\.?$/) && labelCell !== '-'
      && !labelCell.includes('ลำดับ') && labelCell.length > 2
      && !labelCell.match(/^\d+$/)) {
      const looksLikeHeader = ['เอกสาร', 'ตราประทับ', 'วัตถุ', 'ที่ตั้ง', 'หมายเหตุ'].some(
        h => labelCell.includes(h)
      );
      if (looksLikeHeader) break;
    }

    // Skip header row (ลำดับ | ชื่อผู้ถือหุ้น | % | จำนวนหุ้น)
    if (labelCell && labelCell.includes('ลำดับ')) continue;

    // Try to find name
    const nameCell = (rows[i][1] || rows[i][0] || '').toString().trim();
    if (!nameCell || nameCell === '-' || nameCell === 'ลำดับ' || nameCell === 'ชื่อ' || nameCell === 'ชื่อผู้ถือหุ้น') continue;

    // Scan all columns for percentage (%) and shares (หุ้น or large number)
    let percentage = 0;
    let shares = 0;
    for (let c = 2; c < (rows[i].length || 0); c++) {
      const cell = (rows[i][c] || '').toString().trim();
      if (!cell || cell === '-' || cell === 'คิดเป็นอัตราส่วน') continue;
      if (cell.includes('%')) {
        // e.g. "99%", "1%"
        percentage = parseThaiNumber(cell);
      } else if (cell.includes('หุ้น') || (parseThaiNumber(cell) >= 1 && !cell.includes('คิด'))) {
        const num = parseThaiNumber(cell);
        if (num > 0 && num > percentage) {
          shares = num;
        }
      }
    }

    if (nameCell && (shares > 0 || percentage > 0 || nameCell.length > 1)) {
      shareholders.push({
        order: order++,
        name: nameCell.replace(/^\d+\.?\s*/, ''),
        shares,
        percentage: percentage || undefined,
      });
    }
  }

  // Calculate percentages if not provided in sheet
  const hasPercentage = shareholders.some(s => s.percentage);
  if (!hasPercentage) {
    const totalShares = shareholders.reduce((sum, s) => sum + s.shares, 0);
    if (totalShares > 0) {
      shareholders.forEach(s => {
        s.percentage = Math.round((s.shares / totalShares) * 10000) / 100;
      });
    }
  }

  return shareholders;
}

function parseDocuments(rows: SheetRow[]): CompanyDocument[] {
  const docs: CompanyDocument[] = [];
  const startIdx = findRowIndex(rows, 'เอกสาร');
  if (startIdx < 0) return docs;

  for (let i = startIdx + 1; i < rows.length; i++) {
    const nameCell = (rows[i][0] || rows[i][1] || '').toString().trim();
    const linkCell = (rows[i][1] || rows[i][2] || '').toString().trim();
    const dateCell = (rows[i][2] || rows[i][3] || '').toString().trim();
    const expiryCell = (rows[i][3] || '').toString().trim();

    if (!nameCell || nameCell === '-') continue;
    // Skip header row
    if (nameCell === 'ชื่อเอกสาร') continue;
    // Stop at next section
    if (nameCell.startsWith('_') || findRowIndex(rows.slice(i), 'หมายเหตุ') === 0) break;

    const driveFileId = extractDriveFileId(linkCell);
    if (nameCell && (driveFileId || linkCell)) {
      // dateCell: ถ้าไม่ใช่ link และไม่ว่าง ถือว่าเป็นวันที่
      const updatedDate = dateCell && !dateCell.startsWith('http') ? dateCell : undefined;
      const expiryDate = expiryCell && !expiryCell.startsWith('http') ? expiryCell : undefined;
      docs.push({
        name: nameCell.replace(/^\d+\.?\s*/, ''),
        driveFileId,
        driveUrl: linkCell.startsWith('http') ? linkCell : undefined,
        updatedDate,
        expiryDate,
      });
    }
  }
  return docs;
}

// ===== Permissions =====

export async function getPermissions(): Promise<UserPermission[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${SPECIAL_SHEETS.PERMISSIONS}'!A:Z`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0].map((h: string) => h.toString().trim());
    // Headers: LINE User ID | ชื่อ | Role | เอกสาร | approved | pictureUrl | pendingCompanies | company1 | ...
    // Also support old format: ดูเอกสาร | โหลดเอกสาร
    const docIdx = headers.indexOf('เอกสาร');
    const hasOldDocCol = headers[3] === 'ดูเอกสาร';
    const downloadIdx = headers.indexOf('โหลดเอกสาร');
    const approvedIdx = headers.indexOf('approved');
    const pictureUrlIdx = headers.indexOf('pictureUrl');
    const pendingCompaniesIdx = headers.indexOf('pendingCompanies');
    const knownEndIdx = Math.max(
      docIdx >= 0 ? docIdx + 1 : (hasOldDocCol ? 4 : 3),
      downloadIdx >= 0 ? downloadIdx + 1 : 0,
      approvedIdx >= 0 ? approvedIdx + 1 : 0,
      pictureUrlIdx >= 0 ? pictureUrlIdx + 1 : 0,
      pendingCompaniesIdx >= 0 ? pendingCompaniesIdx + 1 : 0,
    );
    const companyHeaders = headers.slice(knownEndIdx);

    return rows.slice(1).map(row => {
      const companies: Record<string, boolean> = {};
      companyHeaders.forEach((name: string, idx: number) => {
        const val = (row[idx + knownEndIdx] || '').toString().trim().toUpperCase();
        companies[name] = val === 'TRUE' || val === '☑' || val === 'YES' || val === '1';
      });
      const isTruthy = (v: string) => v === 'TRUE' || v === '☑' || v === 'YES' || v === '1';
      // New format: "เอกสาร" column, Old format: "ดูเอกสาร" column
      const docColIdx = docIdx >= 0 ? docIdx : (hasOldDocCol ? 3 : -1);
      const docVal = docColIdx >= 0 ? (row[docColIdx] || '').toString().trim().toUpperCase() : 'TRUE';
      const canView = isTruthy(docVal);
      const approvedVal = approvedIdx >= 0 ? (row[approvedIdx] || '').toString().trim().toUpperCase() : 'TRUE';
      const pictureUrlVal = pictureUrlIdx >= 0 ? (row[pictureUrlIdx] || '').toString().trim() : '';
      const pendingCompaniesVal = pendingCompaniesIdx >= 0 ? (row[pendingCompaniesIdx] || '').toString().trim() : '';
      return {
        lineUserId: (row[0] || '').toString().trim(),
        displayName: (row[1] || '').toString().trim(),
        role: ((row[2] || '').toString().trim().toLowerCase() as 'super_admin' | 'admin' | 'viewer') || 'viewer',
        canViewDocuments: canView,
        canDownloadDocuments: canView,
        approved: isTruthy(approvedVal),
        pictureUrl: pictureUrlVal || undefined,
        pendingCompanies: pendingCompaniesVal || undefined,
        companies,
      };
    }).filter(p => p.lineUserId);
  } catch {
    return [];
  }
}

export async function getUserPermission(userId: string): Promise<UserPermission | null> {
  const perms = await getPermissions();
  return perms.find(p => p.lineUserId === userId) || null;
}

export async function getAccessibleCompanies(userId: string): Promise<string[]> {
  const perm = await getUserPermission(userId);
  if (!perm) return [];
  return Object.entries(perm.companies)
    .filter(([, hasAccess]) => hasAccess)
    .map(([name]) => name);
}

// ===== Version History =====

export async function getVersionHistory(companySheet?: string): Promise<VersionEntry[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${SPECIAL_SHEETS.VERSIONS}'!A:F`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    let entries = rows.slice(1).map(row => ({
      timestamp: (row[0] || '').toString(),
      companySheet: (row[1] || '').toString(),
      fieldChanged: (row[2] || '').toString(),
      oldValue: (row[3] || '').toString(),
      newValue: (row[4] || '').toString(),
      changedBy: (row[5] || '').toString(),
    }));

    if (companySheet) {
      entries = entries.filter(e => e.companySheet === companySheet);
    }

    return entries.reverse(); // newest first
  } catch {
    return [];
  }
}

export async function appendVersion(entry: VersionEntry): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = SPECIAL_SHEETS.VERSIONS;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:F`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          entry.timestamp,
          entry.companySheet,
          entry.fieldChanged,
          entry.oldValue,
          entry.newValue,
          entry.changedBy,
        ]],
      },
    });
  } catch (err: any) {
    // Sheet doesn't exist — create it and retry
    if (err.message?.includes('Unable to parse range')) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1:F1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Timestamp', 'Company', 'Field', 'Old Value', 'New Value', 'Changed By']] },
      });
      // Retry append
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:F`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            entry.timestamp,
            entry.companySheet,
            entry.fieldChanged,
            entry.oldValue,
            entry.newValue,
            entry.changedBy,
          ]],
        },
      });
    } else {
      console.error('appendVersion error:', err.message);
    }
  }
}

// ===== Chat Log =====

export async function getChatHistory(userId: string, limit = 20): Promise<ChatLogEntry[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${SPECIAL_SHEETS.CHAT_LOG}'!A:E`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    return rows.slice(1)
      .map(row => ({
        timestamp: (row[0] || '').toString(),
        userId: (row[1] || '').toString(),
        role: (row[2] || '').toString() as 'user' | 'assistant',
        message: (row[3] || '').toString(),
        companyContext: (row[4] || '').toString(),
      }))
      .filter(e => e.userId === userId)
      .slice(-limit);
  } catch {
    return [];
  }
}

export async function appendChatLog(entry: ChatLogEntry): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `'${SPECIAL_SHEETS.CHAT_LOG}'!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        entry.timestamp,
        entry.userId,
        entry.role,
        entry.message,
        entry.companyContext,
      ]],
    },
  });
}

// ===== Write back to sheet =====

export async function updateCompanyField(
  sheetName: string,
  label: string,
  newValue: string
): Promise<{ row: number; oldValue: string } | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:B`,
  });
  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i][0] || '').toString().trim();
    if (cell === label || cell.includes(label)) {
      const oldValue = (rows[i][1] || '').toString();
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `'${sheetName}'!B${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newValue]] },
      });
      clearCache('company:' + sheetName);
      return { row: i + 1, oldValue };
    }
  }
  return null;
}

// ===== Update seal image Drive ID in sheet =====

export async function updateSealInSheet(sheetName: string, urlOrId: string): Promise<boolean> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:B`,
  });
  const rows = res.data.values || [];
  const idx = findRowIndex(rows, 'ตราประทับ');
  if (idx < 0) return false;

  // Store the value as-is (can be a full URL or a Drive file ID)
  const value = urlOrId.startsWith('http') ? urlOrId : `https://drive.google.com/file/d/${urlOrId}/view`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!B${idx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
  return true;
}

// ===== Update document link + date in sheet =====

export async function updateDocumentInSheet(
  sheetName: string,
  documentName: string,
  newDriveUrl: string,
  expiryDate?: string,
): Promise<{ row: number; oldLink: string } | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:D`,
  });
  const rows = res.data.values || [];

  // Find the document section and matching row
  const docSectionIdx = findRowIndex(rows, 'เอกสาร');
  if (docSectionIdx < 0) return null;

  for (let i = docSectionIdx + 1; i < rows.length; i++) {
    const nameCell = (rows[i][0] || '').toString().trim();
    // Stop at next section
    if (nameCell.startsWith('_')) break;
    const looksLikeHeader = ['ตราประทับ', 'วัตถุ', 'ที่ตั้ง', 'หมายเหตุ', 'ผู้ถือหุ้น', 'กรรมการ', 'อำนาจ', 'ทุน'].some(
      h => nameCell.includes(h)
    );
    if (looksLikeHeader) break;

    if (nameCell === documentName || nameCell.includes(documentName)) {
      const oldLink = (rows[i][1] || '').toString();
      const now = new Date();
      const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      const existingExpiry = (rows[i][3] || '').toString();

      // Update columns B (link), C (date), D (expiry) in one call
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `'${sheetName}'!B${i + 1}:D${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newDriveUrl, dateStr, expiryDate ?? existingExpiry]] },
      });
      return { row: i + 1, oldLink };
    }
  }
  return null;
}

// ===== Add new document row to sheet =====

export async function addDocumentToSheet(
  sheetName: string,
  documentName: string,
  driveUrl: string,
  expiryDate?: string,
): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:D`,
  });
  const rows = res.data.values || [];

  const docSectionIdx = findRowIndex(rows, 'เอกสาร');
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  if (docSectionIdx < 0) {
    // No document section yet — append at the end
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: `'${sheetName}'!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [
        ['เอกสารที่เกี่ยวข้อง', '', '', ''],
        [documentName, driveUrl, dateStr, expiryDate || ''],
      ] },
    });
  } else {
    // Find last row of document section
    let lastDocRow = docSectionIdx + 1;
    for (let i = docSectionIdx + 1; i < rows.length; i++) {
      const nameCell = (rows[i][0] || '').toString().trim();
      if (!nameCell || nameCell === '-') { lastDocRow = i; continue; }
      const looksLikeHeader = ['_', 'ตราประทับ', 'วัตถุ', 'ที่ตั้ง', 'หมายเหตุ', 'ผู้ถือหุ้น', 'กรรมการ', 'อำนาจ', 'ทุน'].some(
        h => nameCell.startsWith(h) || nameCell.includes(h)
      );
      if (looksLikeHeader) break;
      lastDocRow = i + 1;
    }

    // Insert at lastDocRow
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSpreadsheetId(),
      range: `'${sheetName}'!A${lastDocRow + 1}:D${lastDocRow + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[documentName, driveUrl, dateStr, expiryDate || '']] },
    });
  }
}

// ===== Update document expiry date =====

export async function updateDocumentExpiry(
  sheetName: string,
  documentName: string,
  expiryDate: string,
): Promise<{ row: number } | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:D`,
  });
  const rows = res.data.values || [];

  const docSectionIdx = findRowIndex(rows, 'เอกสาร');
  if (docSectionIdx < 0) return null;

  for (let i = docSectionIdx + 1; i < rows.length; i++) {
    const nameCell = (rows[i][0] || '').toString().trim();
    if (nameCell.startsWith('_')) break;
    const looksLikeHeader = ['ตราประทับ', 'วัตถุ', 'ที่ตั้ง', 'หมายเหตุ', 'ผู้ถือหุ้น', 'กรรมการ', 'อำนาจ', 'ทุน'].some(
      h => nameCell.includes(h)
    );
    if (looksLikeHeader) break;

    if (nameCell === documentName || nameCell.includes(documentName)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `'${sheetName}'!D${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[expiryDate]] },
      });
      return { row: i + 1 };
    }
  }
  return null;
}

// ===== Document expiry status helper =====

export function getDocumentExpiryStatus(expiryDateStr?: string): 'expired' | 'expiring-7d' | 'expiring-30d' | 'ok' | null {
  if (!expiryDateStr) return null;

  // Try parsing various date formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
  let expiry: Date | null = null;
  const trimmed = expiryDateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    expiry = new Date(trimmed + 'T00:00:00+07:00');
  }
  // DD/MM/YYYY or DD-MM-YYYY
  else {
    const match = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      expiry = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+07:00`);
    }
  }

  if (!expiry || isNaN(expiry.getTime())) return null;

  // Use Bangkok timezone for "today"
  const nowBangkok = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const today = new Date(nowBangkok.getFullYear(), nowBangkok.getMonth(), nowBangkok.getDate());
  const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

  const diffMs = expiryDay.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 7) return 'expiring-7d';
  if (diffDays <= 30) return 'expiring-30d';
  return 'ok';
}

// ===== Update permissions =====

export async function updatePermissions(permissions: UserPermission[]): Promise<void> {
  const sheets = getSheetsClient();
  const companySheets = await listCompanySheets();

  const headers = ['LINE User ID', 'ชื่อ', 'Role', 'เอกสาร', 'approved', 'pictureUrl', 'pendingCompanies', ...companySheets];
  const rows = permissions.map(p => [
    p.lineUserId,
    p.displayName,
    p.role,
    p.canViewDocuments !== false ? 'TRUE' : 'FALSE',
    p.approved !== false ? 'TRUE' : 'FALSE',
    p.pictureUrl || '',
    p.pendingCompanies || '',
    ...companySheets.map(name => p.companies[name] ? 'TRUE' : 'FALSE'),
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'${SPECIAL_SHEETS.PERMISSIONS}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers, ...rows] },
  });
}

// ===== Get all chat logs (for admin) =====

export async function getAllChatLogs(limit = 100): Promise<ChatLogEntry[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${SPECIAL_SHEETS.CHAT_LOG}'!A:E`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    return rows.slice(1)
      .map(row => ({
        timestamp: (row[0] || '').toString(),
        userId: (row[1] || '').toString(),
        role: (row[2] || '').toString() as 'user' | 'assistant',
        message: (row[3] || '').toString(),
        companyContext: (row[4] || '').toString(),
      }))
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

// ===== Create New Company Sheet =====

export async function createCompanySheet(sheetName: string): Promise<{ driveFolderId?: string }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // 1. Add new tab
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  // 2. Write template rows
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  const templateRows = [
    ['ข้อมูล ณ วันที่', dateStr],
    ['ชื่อบริษัท', ''],
    ['Company Name', ''],
    ['เลขทะเบียนนิติบุคคล', ''],
    [''],
    ['กรรมการ', '0 คน'],
    [''],
    ['อำนาจกรรมการ', ''],
    [''],
    ['ทุนจดทะเบียน', ''],
    [''],
    ['ที่ตั้งสำนักงานใหญ่', ''],
    ['วัตถุประสงค์', ''],
    ['ตราประทับ', ''],
    [''],
    ['ผู้ถือหุ้น', '0 คน'],
    ['ลำดับ', 'ชื่อผู้ถือหุ้น', '%', '', 'จำนวนหุ้น'],
    [''],
    [''],
    ['เอกสารที่เกี่ยวข้อง'],
    ['ชื่อเอกสาร', 'ลิงก์', 'วันที่อัปเดต', 'วันหมดอายุ'],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: templateRows },
  });

  // 3. Create Drive subfolder for this company
  let driveFolderId: string | undefined;
  try {
    const drive = getDriveClient();
    const parentFolderId = getDriveFolderId();
    if (parentFolderId) {
      const folderRes = await drive.files.create({
        requestBody: {
          name: sheetName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      driveFolderId = (folderRes as any).data.id;
    }
  } catch {
    // Drive folder creation is optional
  }

  clearCache('companySheets');
  return { driveFolderId };
}

// ===== Delete Company Sheet =====

export async function deleteCompanySheet(sheetName: string): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Get sheet ID from title
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const sheetMeta = (meta.data.sheets || []).find(
    s => s.properties?.title === sheetName
  );
  if (!sheetMeta?.properties?.sheetId && sheetMeta?.properties?.sheetId !== 0) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteSheet: { sheetId: sheetMeta.properties!.sheetId! } }],
    },
  });
  clearCache('companySheets');
}

// ===== Update Directors Section =====

export async function updateDirectors(sheetName: string, directors: Director[]): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Get all current data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  });
  const rows: SheetRow[] = res.data.values || [];

  // Find the "กรรมการ" label row
  const directorLabelIdx = findRowIndex(rows, 'กรรมการ');
  if (directorLabelIdx < 0) throw new Error('Director section not found');

  // Find the end of director section (next labeled section like "อำนาจกรรมการ")
  let endIdx = directorLabelIdx + 1;
  for (let i = directorLabelIdx + 1; i < rows.length; i++) {
    const cell = (rows[i][0] || '').toString().trim();
    if (cell && !cell.match(/^\d+\.?$/) && cell !== '-') {
      endIdx = i;
      break;
    }
    endIdx = i + 1;
  }

  // Get the sheet's numeric ID for row manipulation
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const sheetMeta = (meta.data.sheets || []).find(
    s => s.properties?.title === sheetName
  );
  const sheetId = sheetMeta?.properties?.sheetId ?? 0;

  // Build requests: delete old director rows, insert new ones
  const requests: any[] = [];

  // Delete existing director data rows (between label and next section)
  const deleteFrom = directorLabelIdx + 1;
  const deleteTo = endIdx;
  if (deleteTo > deleteFrom) {
    requests.push({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: deleteFrom, endIndex: deleteTo },
      },
    });
  }

  // Insert new rows for directors
  if (directors.length > 0) {
    requests.push({
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: deleteFrom, endIndex: deleteFrom + directors.length },
        inheritFromBefore: true,
      },
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  // Write director data
  if (directors.length > 0) {
    const directorRows = directors.map((d, i) => [
      `${i + 1}.`,
      d.name,
      d.position || '',
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A${deleteFrom + 1}:C${deleteFrom + directors.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: directorRows },
    });
  }

  // Update count on the label row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!B${directorLabelIdx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[`${directors.length} คน`]] },
  });
  clearCache('company:' + sheetName);
}

// ===== Update Shareholders Section =====

export async function updateShareholders(sheetName: string, shareholders: Shareholder[]): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Get all current data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  });
  const rows: SheetRow[] = res.data.values || [];

  // Find the "ผู้ถือหุ้น" label row
  const shLabelIdx = findRowIndex(rows, 'ผู้ถือหุ้น');
  if (shLabelIdx < 0) throw new Error('Shareholder section not found');

  // Find the header row "ลำดับ" if it exists (skip it)
  let dataStartIdx = shLabelIdx + 1;
  if (dataStartIdx < rows.length) {
    const nextCell = (rows[dataStartIdx][0] || '').toString().trim();
    if (nextCell.includes('ลำดับ')) dataStartIdx++;
  }

  // Find the end of shareholder section (next major section like "เอกสาร")
  let endIdx = dataStartIdx;
  for (let i = dataStartIdx; i < rows.length; i++) {
    const cell = (rows[i][0] || '').toString().trim();
    if (cell && !cell.match(/^\d+\.?$/) && cell !== '-' && cell.length > 2) {
      const looksLikeHeader = ['เอกสาร', 'ตราประทับ', 'วัตถุ', 'ที่ตั้ง', 'หมายเหตุ'].some(
        h => cell.includes(h)
      );
      if (looksLikeHeader) { endIdx = i; break; }
    }
    endIdx = i + 1;
  }

  // Get sheet ID
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  const sheetMeta = (meta.data.sheets || []).find(
    s => s.properties?.title === sheetName
  );
  const sheetId = sheetMeta?.properties?.sheetId ?? 0;

  // Delete old shareholder data rows
  const requests: any[] = [];
  if (endIdx > dataStartIdx) {
    requests.push({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: dataStartIdx, endIndex: endIdx },
      },
    });
  }

  // Insert new rows
  if (shareholders.length > 0) {
    requests.push({
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: dataStartIdx, endIndex: dataStartIdx + shareholders.length },
        inheritFromBefore: true,
      },
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  // Write shareholder data
  if (shareholders.length > 0) {
    const shRows = shareholders.map((s, i) => [
      `${i + 1}`,
      s.name,
      s.percentage ? `${s.percentage}%` : '',
      '',
      String(s.shares || ''),
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A${dataStartIdx + 1}:E${dataStartIdx + shareholders.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: shRows },
    });
  }

  // Update count on the label row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!B${shLabelIdx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[`${shareholders.length} คน`]] },
  });
  clearCache('company:' + sheetName);
}
