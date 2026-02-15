import { getSheetsClient, getSpreadsheetId } from './google-auth';
import {
  Company, Director, Shareholder, CompanyDocument,
  ShareBreakdown, UserPermission, VersionEntry, ChatLogEntry,
  SPECIAL_SHEETS
} from './types';
import { parseThaiNumber, extractDriveFileId, isSpecialSheet } from './utils';

type SheetRow = (string | undefined)[];

// ===== List All Company Sheets =====

export async function listCompanySheets(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    fields: 'sheets.properties.title',
  });
  return (res.data.sheets || [])
    .map(s => s.properties?.title || '')
    .filter(name => name && !isSpecialSheet(name));
}

// ===== Parse Company Data from Sheet =====

export async function parseCompanySheet(sheetName: string): Promise<Company> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:Z`,
  });
  const rows: SheetRow[] = res.data.values || [];
  return parseRows(sheetName, rows);
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

  // Seal image
  const sealRaw = findValue(rows, 'ตราประทับ');
  const sealImageDriveId = extractDriveFileId(sealRaw);

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
    shareholders,
    documents,
  };
}

function parseDirectors(rows: SheetRow[]): Director[] {
  const directors: Director[] = [];
  const startIdx = findRowIndex(rows, 'กรรมการ');
  if (startIdx < 0) return directors;

  // First director might be on the same row
  const firstVal = (rows[startIdx][1] || '').toString().trim();
  if (firstVal && !firstVal.match(/^\d+$/)) {
    directors.push({ name: firstVal, position: (rows[startIdx][2] || '').toString().trim() || undefined });
  }

  // Subsequent rows until we hit the next section
  for (let i = startIdx + 1; i < rows.length; i++) {
    const labelCell = (rows[i][0] || '').toString().trim();
    // Stop at next labeled section
    if (labelCell && !labelCell.match(/^\d+\.?$/) && labelCell !== '-') break;

    const nameCell = (rows[i][1] || rows[i][0] || '').toString().trim();
    if (!nameCell || nameCell === '-') continue;

    // If row starts with number like "1." or is blank label with name in col B
    const position = (rows[i][2] || '').toString().trim() || undefined;
    directors.push({ name: nameCell.replace(/^\d+\.?\s*/, ''), position });
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

    // Try to find name
    const nameCell = (rows[i][1] || rows[i][0] || '').toString().trim();
    if (!nameCell || nameCell === '-' || nameCell === 'ลำดับ' || nameCell === 'ชื่อ') continue;

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

    if (!nameCell || nameCell === '-') continue;
    // Stop at next section
    if (nameCell.startsWith('_') || findRowIndex(rows.slice(i), 'หมายเหตุ') === 0) break;

    const driveFileId = extractDriveFileId(linkCell);
    if (nameCell && (driveFileId || linkCell)) {
      // dateCell: ถ้าไม่ใช่ link และไม่ว่าง ถือว่าเป็นวันที่
      const updatedDate = dateCell && !dateCell.startsWith('http') ? dateCell : undefined;
      docs.push({
        name: nameCell.replace(/^\d+\.?\s*/, ''),
        driveFileId,
        driveUrl: linkCell.startsWith('http') ? linkCell : undefined,
        updatedDate,
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
    // Headers: LINE User ID | ชื่อ | Role | company1 | company2 | ...
    const companyHeaders = headers.slice(3);

    return rows.slice(1).map(row => {
      const companies: Record<string, boolean> = {};
      companyHeaders.forEach((name: string, idx: number) => {
        const val = (row[idx + 3] || '').toString().trim().toUpperCase();
        companies[name] = val === 'TRUE' || val === '☑' || val === 'YES' || val === '1';
      });
      return {
        lineUserId: (row[0] || '').toString().trim(),
        displayName: (row[1] || '').toString().trim(),
        role: ((row[2] || '').toString().trim().toLowerCase() as 'admin' | 'viewer') || 'viewer',
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
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `'${SPECIAL_SHEETS.VERSIONS}'!A:F`,
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
      return { row: i + 1, oldValue };
    }
  }
  return null;
}

// ===== Update document link + date in sheet =====

export async function updateDocumentInSheet(
  sheetName: string,
  documentName: string,
  newDriveUrl: string,
): Promise<{ row: number; oldLink: string } | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:C`,
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

      // Update columns B (link) and C (date) in one call
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `'${sheetName}'!B${i + 1}:C${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newDriveUrl, dateStr]] },
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
): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:C`,
  });
  const rows = res.data.values || [];

  const docSectionIdx = findRowIndex(rows, 'เอกสาร');
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  if (docSectionIdx < 0) {
    // No document section yet — append at the end
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: `'${sheetName}'!A:C`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [
        ['เอกสารที่เกี่ยวข้อง', '', ''],
        [documentName, driveUrl, dateStr],
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
      range: `'${sheetName}'!A${lastDocRow + 1}:C${lastDocRow + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[documentName, driveUrl, dateStr]] },
    });
  }
}

// ===== Update permissions =====

export async function updatePermissions(permissions: UserPermission[]): Promise<void> {
  const sheets = getSheetsClient();
  const companySheets = await listCompanySheets();

  const headers = ['LINE User ID', 'ชื่อ', 'Role', ...companySheets];
  const rows = permissions.map(p => [
    p.lineUserId,
    p.displayName,
    p.role,
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
