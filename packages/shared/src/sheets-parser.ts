import { getSheetsClient, getSpreadsheetId, getDriveClient, getDriveFolderId } from './google-auth';
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
    // Headers: LINE User ID | ชื่อ | Role | ดูเอกสาร | company1 | company2 | ...
    // Support old format without ดูเอกสาร column
    const hasDocCol = headers[3] === 'ดูเอกสาร';
    const companyStartIdx = hasDocCol ? 4 : 3;
    const companyHeaders = headers.slice(companyStartIdx);

    return rows.slice(1).map(row => {
      const companies: Record<string, boolean> = {};
      companyHeaders.forEach((name: string, idx: number) => {
        const val = (row[idx + companyStartIdx] || '').toString().trim().toUpperCase();
        companies[name] = val === 'TRUE' || val === '☑' || val === 'YES' || val === '1';
      });
      const docVal = hasDocCol ? (row[3] || '').toString().trim().toUpperCase() : 'TRUE';
      return {
        lineUserId: (row[0] || '').toString().trim(),
        displayName: (row[1] || '').toString().trim(),
        role: ((row[2] || '').toString().trim().toLowerCase() as 'admin' | 'viewer') || 'viewer',
        canViewDocuments: docVal === 'TRUE' || docVal === '☑' || docVal === 'YES' || docVal === '1',
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

// ===== Update seal image Drive ID in sheet =====

export async function updateSealInSheet(sheetName: string, driveFileId: string): Promise<boolean> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!A:B`,
  });
  const rows = res.data.values || [];
  const idx = findRowIndex(rows, 'ตราประทับ');
  if (idx < 0) return false;

  const driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'${sheetName}'!B${idx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[driveUrl]] },
  });
  return true;
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

  const headers = ['LINE User ID', 'ชื่อ', 'Role', 'ดูเอกสาร', ...companySheets];
  const rows = permissions.map(p => [
    p.lineUserId,
    p.displayName,
    p.role,
    p.canViewDocuments !== false ? 'TRUE' : 'FALSE',
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
    ['ชื่อเอกสาร', 'ลิงก์', 'วันที่อัปเดต'],
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
      });
      driveFolderId = (folderRes as any).data.id;
    }
  } catch {
    // Drive folder creation is optional
  }

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
}
