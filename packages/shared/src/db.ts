import { getSupabase } from './supabase';
import { getDriveClient, getDriveFolderId } from './google-auth';
import {
  Company, Director, Shareholder, CompanyDocument,
  ShareBreakdown, UserPermission, VersionEntry, ChatLogEntry,
} from './types';
import { extractDriveFileId } from './utils';

// ===== Helper: get company ID by sheet_name =====

async function getCompanyId(sheetName: string): Promise<number | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from('companies')
    .select('id')
    .eq('sheet_name', sheetName)
    .single();
  return data?.id ?? null;
}

// ===== List All Company Sheets =====

export async function listCompanySheets(): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('companies')
    .select('sheet_name')
    .order('sheet_name');
  if (error) throw error;
  return (data || []).map(r => r.sheet_name);
}

// ===== Parse Company Data =====

export async function parseCompanySheet(sheetName: string): Promise<Company> {
  const sb = getSupabase();

  // Fetch company row
  const { data: co, error } = await sb
    .from('companies')
    .select('*')
    .eq('sheet_name', sheetName)
    .single();
  if (error || !co) throw new Error(`Company "${sheetName}" not found`);

  // Fetch related data in parallel
  const [dirsRes, shRes, docsRes] = await Promise.all([
    sb.from('directors').select('*').eq('company_id', co.id).order('sort_order'),
    sb.from('shareholders').select('*').eq('company_id', co.id).order('sort_order'),
    sb.from('company_documents').select('*').eq('company_id', co.id),
  ]);

  const directors: Director[] = (dirsRes.data || []).map(d => ({
    name: d.name,
    position: d.position || undefined,
  }));

  const shareholders: Shareholder[] = (shRes.data || []).map(s => ({
    order: s.sort_order,
    name: s.name,
    shares: Number(s.shares) || 0,
    percentage: s.percentage != null ? Number(s.percentage) : undefined,
  }));

  const documents: CompanyDocument[] = (docsRes.data || []).map(d => ({
    name: d.name,
    driveFileId: d.drive_file_id || '',
    type: d.type || undefined,
    driveUrl: d.drive_url || undefined,
    updatedDate: d.updated_date || undefined,
    expiryDate: d.expiry_date || undefined,
  }));

  const shareBreakdown: ShareBreakdown = {
    totalShares: Number(co.total_shares) || 0,
    parValue: Number(co.par_value) || 100,
    paidUpShares: Number(co.paid_up_shares) || 0,
    paidUpAmount: Number(co.paid_up_amount) || 0,
  };

  return {
    sheetName: co.sheet_name,
    dataDate: co.data_date || '',
    companyNameTh: co.company_name_th || co.sheet_name,
    companyNameEn: co.company_name_en || '',
    registrationNumber: co.registration_number || '',
    directorCount: co.director_count || directors.length,
    directors,
    authorizedSignatory: co.authorized_signatory || '',
    registeredCapital: Number(co.registered_capital) || 0,
    capitalText: co.capital_text || '',
    shareBreakdown,
    headOfficeAddress: co.head_office_address || '',
    objectives: co.objectives || '',
    sealImageDriveId: co.seal_image_drive_id || '',
    sealImageUrl: co.seal_image_url || '',
    shareholders,
    documents,
  };
}

// ===== Create Company =====

export async function createCompanySheet(sheetName: string): Promise<{ driveFolderId?: string }> {
  const sb = getSupabase();

  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  const { error } = await sb
    .from('companies')
    .insert({ sheet_name: sheetName, data_date: dateStr });
  if (error) throw error;

  // Create Drive subfolder (same as sheets-parser.ts)
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

  return { driveFolderId };
}

// ===== Delete Company (CASCADE deletes directors, shareholders, documents, access) =====

export async function deleteCompanySheet(sheetName: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('companies')
    .delete()
    .eq('sheet_name', sheetName);
  if (error) throw error;
}

// ===== Update Company Field =====

const THAI_LABEL_TO_COLUMN: Record<string, string> = {
  'ณ วันที่': 'data_date',
  'วันที่': 'data_date',
  'ชื่อบริษัท': 'company_name_th',
  'Company Name': 'company_name_en',
  'ชื่อภาษาอังกฤษ': 'company_name_en',
  'เลขทะเบียนนิติบุคคล': 'registration_number',
  'เลขทะเบียน': 'registration_number',
  'อำนาจกรรมการ': 'authorized_signatory',
  'ทุนจดทะเบียน': 'capital_text',
  'ที่ตั้งสำนักงานใหญ่': 'head_office_address',
  'ที่อยู่': 'head_office_address',
  'วัตถุประสงค์': 'objectives',
  'ตราประทับ': 'seal_image_drive_id',
  'จำนวนหุ้น': 'total_shares',
  'หุ้นทั้งหมด': 'total_shares',
  'มูลค่าหุ้นละ': 'par_value',
  'มูลค่าที่ตราไว้': 'par_value',
  'ชำระแล้ว': 'paid_up_amount',
  'ทุนชำระแล้ว': 'paid_up_amount',
};

export async function updateCompanyField(
  sheetName: string,
  label: string,
  newValue: string,
): Promise<{ row: number; oldValue: string } | null> {
  // Find column from label (exact match first, then partial)
  let column = THAI_LABEL_TO_COLUMN[label];
  if (!column) {
    const entry = Object.entries(THAI_LABEL_TO_COLUMN).find(
      ([key]) => label.includes(key) || key.includes(label)
    );
    column = entry?.[1] ?? null as any;
  }
  if (!column) return null;

  const sb = getSupabase();

  // Get old value
  const { data: co } = await sb
    .from('companies')
    .select(column)
    .eq('sheet_name', sheetName)
    .single();
  if (!co) return null;

  const oldValue = String((co as any)[column] ?? '');

  // Handle capital_text: also update registered_capital
  const updates: Record<string, any> = { [column]: newValue };
  if (column === 'capital_text') {
    const cleaned = newValue.replace(/,/g, '').replace(/[^\d.-]/g, '');
    const num = Number(cleaned) || 0;
    if (num > 0) updates.registered_capital = num;
  }

  const { error } = await sb
    .from('companies')
    .update(updates)
    .eq('sheet_name', sheetName);
  if (error) throw error;

  return { row: 1, oldValue };
}

// ===== Update Directors =====

export async function updateDirectors(sheetName: string, directors: Director[]): Promise<void> {
  const sb = getSupabase();
  const companyId = await getCompanyId(sheetName);
  if (!companyId) throw new Error(`Company "${sheetName}" not found`);

  // Delete old directors
  await sb.from('directors').delete().eq('company_id', companyId);

  // Insert new directors
  if (directors.length > 0) {
    const rows = directors.map((d, i) => ({
      company_id: companyId,
      name: d.name,
      position: d.position || null,
      sort_order: i + 1,
    }));
    const { error } = await sb.from('directors').insert(rows);
    if (error) throw error;
  }

  // Update director count
  await sb
    .from('companies')
    .update({ director_count: directors.length })
    .eq('id', companyId);
}

// ===== Update Shareholders =====

export async function updateShareholders(sheetName: string, shareholders: Shareholder[]): Promise<void> {
  const sb = getSupabase();
  const companyId = await getCompanyId(sheetName);
  if (!companyId) throw new Error(`Company "${sheetName}" not found`);

  // Delete old shareholders
  await sb.from('shareholders').delete().eq('company_id', companyId);

  // Insert new shareholders
  if (shareholders.length > 0) {
    const rows = shareholders.map((s, i) => ({
      company_id: companyId,
      sort_order: s.order || i + 1,
      name: s.name,
      shares: s.shares || 0,
      percentage: s.percentage ?? null,
    }));
    const { error } = await sb.from('shareholders').insert(rows);
    if (error) throw error;
  }
}

// ===== Update Document In Sheet =====

export async function updateDocumentInSheet(
  sheetName: string,
  documentName: string,
  newDriveUrl: string,
  expiryDate?: string,
): Promise<{ row: number; oldLink: string } | null> {
  const sb = getSupabase();
  const companyId = await getCompanyId(sheetName);
  if (!companyId) return null;

  // Find matching document
  const { data: docs } = await sb
    .from('company_documents')
    .select('*')
    .eq('company_id', companyId);

  const doc = (docs || []).find(d =>
    d.name === documentName ||
    d.name.includes(documentName) ||
    documentName.includes(d.name)
  );
  if (!doc) return null;

  const oldLink = doc.drive_url || '';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  // Strip old date from name, then add new date
  const baseName = documentName.replace(/\s*\(\d{2}\/\d{2}\/\d{4}\)\s*$/, '').trim();
  const nameWithDate = `${baseName} (${dateStr})`;

  const driveFileId = extractDriveFileId(newDriveUrl);

  const { error } = await sb
    .from('company_documents')
    .update({
      name: nameWithDate,
      drive_url: newDriveUrl,
      drive_file_id: driveFileId,
      updated_date: dateStr,
      expiry_date: expiryDate ?? doc.expiry_date ?? '',
    })
    .eq('id', doc.id);
  if (error) throw error;

  return { row: doc.id, oldLink };
}

// ===== Add Document =====

export async function addDocumentToSheet(
  sheetName: string,
  documentName: string,
  driveUrl: string,
  expiryDate?: string,
): Promise<void> {
  const sb = getSupabase();
  const companyId = await getCompanyId(sheetName);
  if (!companyId) throw new Error(`Company "${sheetName}" not found`);

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  const driveFileId = extractDriveFileId(driveUrl);

  const { error } = await sb.from('company_documents').insert({
    company_id: companyId,
    name: `${documentName} (${dateStr})`,
    drive_file_id: driveFileId,
    drive_url: driveUrl,
    updated_date: dateStr,
    expiry_date: expiryDate || '',
  });
  if (error) throw error;
}

// ===== Remove Document =====

export async function removeDocumentFromSheet(
  sheetName: string,
  documentName: string,
): Promise<boolean> {
  const sb = getSupabase();
  const companyId = await getCompanyId(sheetName);
  if (!companyId) return false;

  const { data: docs } = await sb
    .from('company_documents')
    .select('id, name')
    .eq('company_id', companyId);

  const doc = (docs || []).find(d => d.name === documentName);
  if (!doc) return false;

  const { error } = await sb
    .from('company_documents')
    .delete()
    .eq('id', doc.id);
  return !error;
}

// ===== Update Document Expiry =====

export async function updateDocumentExpiry(
  sheetName: string,
  documentName: string,
  expiryDate: string,
): Promise<{ row: number } | null> {
  const sb = getSupabase();
  const companyId = await getCompanyId(sheetName);
  if (!companyId) return null;

  const { data: docs } = await sb
    .from('company_documents')
    .select('id, name')
    .eq('company_id', companyId);

  const doc = (docs || []).find(d =>
    d.name === documentName ||
    d.name.includes(documentName) ||
    documentName.includes(d.name)
  );
  if (!doc) return null;

  const { error } = await sb
    .from('company_documents')
    .update({ expiry_date: expiryDate })
    .eq('id', doc.id);
  if (error) throw error;

  return { row: doc.id };
}

// ===== Update Seal Image =====

export async function updateSealInSheet(sheetName: string, urlOrId: string): Promise<boolean> {
  const sb = getSupabase();

  const isExternalUrl = urlOrId.startsWith('http') && !urlOrId.includes('drive.google.com');
  const updates: Record<string, string> = {};

  if (isExternalUrl) {
    updates.seal_image_url = urlOrId;
    updates.seal_image_drive_id = '';
  } else {
    const driveId = extractDriveFileId(urlOrId) || urlOrId;
    updates.seal_image_drive_id = driveId;
    updates.seal_image_url = '';
  }

  const { error } = await sb
    .from('companies')
    .update(updates)
    .eq('sheet_name', sheetName);

  return !error;
}

// ===== Permissions =====

export async function getPermissions(): Promise<UserPermission[]> {
  const sb = getSupabase();
  try {
    // Get all users with their company access
    const { data: users, error } = await sb
      .from('user_permissions')
      .select('*');
    if (error || !users) return [];

    // Get all company access mappings with company sheet names
    const { data: accessRows } = await sb
      .from('user_company_access')
      .select('user_id, company_id, companies(sheet_name)');

    // Get all company sheet names for the full map
    const allCompanies = await listCompanySheets();

    // Build access lookup: userId -> Set<sheetName>
    const accessMap: Record<number, Set<string>> = {};
    for (const row of accessRows || []) {
      const uid = row.user_id;
      const sheetName = (row as any).companies?.sheet_name;
      if (!sheetName) continue;
      if (!accessMap[uid]) accessMap[uid] = new Set();
      accessMap[uid].add(sheetName);
    }

    return users.map(u => {
      const userAccess = accessMap[u.id] || new Set();
      const companies: Record<string, boolean> = {};
      for (const name of allCompanies) {
        companies[name] = userAccess.has(name);
      }
      return {
        lineUserId: u.line_user_id,
        displayName: u.display_name || '',
        role: (u.role || 'viewer') as 'super_admin' | 'admin' | 'viewer',
        canViewDocuments: u.can_view_documents !== false,
        canDownloadDocuments: u.can_download_documents !== false,
        approved: u.approved !== false,
        pictureUrl: u.picture_url || undefined,
        pendingCompanies: u.pending_companies || undefined,
        companies,
      };
    });
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

// ===== Update Permissions (full replace) =====

export async function updatePermissions(permissions: UserPermission[]): Promise<void> {
  const sb = getSupabase();

  // Delete all existing permissions and access
  await sb.from('user_company_access').delete().neq('id', 0);
  await sb.from('user_permissions').delete().neq('id', 0);

  if (permissions.length === 0) return;

  // Insert users
  const userRows = permissions.map(p => ({
    line_user_id: p.lineUserId,
    display_name: p.displayName,
    role: p.role,
    can_view_documents: p.canViewDocuments !== false,
    can_download_documents: p.canDownloadDocuments !== false,
    approved: p.approved !== false,
    picture_url: p.pictureUrl || null,
    pending_companies: p.pendingCompanies || null,
  }));

  const { data: insertedUsers, error: userErr } = await sb
    .from('user_permissions')
    .insert(userRows)
    .select('id, line_user_id');
  if (userErr) throw userErr;

  // Build user ID lookup
  const userIdMap: Record<string, number> = {};
  for (const u of insertedUsers || []) {
    userIdMap[u.line_user_id] = u.id;
  }

  // Get company ID lookup
  const { data: companies } = await sb
    .from('companies')
    .select('id, sheet_name');
  const companyIdMap: Record<string, number> = {};
  for (const c of companies || []) {
    companyIdMap[c.sheet_name] = c.id;
  }

  // Insert access mappings
  const accessRows: { user_id: number; company_id: number }[] = [];
  for (const p of permissions) {
    const userId = userIdMap[p.lineUserId];
    if (!userId) continue;
    for (const [companyName, hasAccess] of Object.entries(p.companies)) {
      if (!hasAccess) continue;
      const companyId = companyIdMap[companyName];
      if (!companyId) continue;
      accessRows.push({ user_id: userId, company_id: companyId });
    }
  }

  if (accessRows.length > 0) {
    const { error: accessErr } = await sb
      .from('user_company_access')
      .insert(accessRows);
    if (accessErr) throw accessErr;
  }
}

// ===== Version History =====

export async function getVersionHistory(companySheet?: string): Promise<VersionEntry[]> {
  const sb = getSupabase();
  try {
    let query = sb
      .from('version_history')
      .select('*')
      .order('id', { ascending: false });

    if (companySheet) {
      query = query.eq('company_sheet', companySheet);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(row => ({
      timestamp: row.timestamp,
      companySheet: row.company_sheet,
      fieldChanged: row.field_changed,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedBy: row.changed_by,
    }));
  } catch {
    return [];
  }
}

export async function appendVersion(entry: VersionEntry): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from('version_history').insert({
    timestamp: entry.timestamp,
    company_sheet: entry.companySheet,
    field_changed: entry.fieldChanged,
    old_value: entry.oldValue,
    new_value: entry.newValue,
    changed_by: entry.changedBy,
  });
  if (error) console.error('appendVersion error:', error.message);
}

// ===== Chat Log =====

export async function getChatHistory(userId: string, limit = 20): Promise<ChatLogEntry[]> {
  const sb = getSupabase();
  try {
    // Get last N messages for user by ordering desc then reversing
    const { data, error } = await sb
      .from('chat_logs')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return (data || []).reverse().map(row => ({
      timestamp: row.timestamp,
      userId: row.user_id,
      role: row.role as 'user' | 'assistant',
      message: row.message,
      companyContext: row.company_context,
    }));
  } catch {
    return [];
  }
}

export async function appendChatLog(entry: ChatLogEntry): Promise<void> {
  const sb = getSupabase();
  await sb.from('chat_logs').insert({
    timestamp: entry.timestamp,
    user_id: entry.userId,
    role: entry.role,
    message: entry.message,
    company_context: entry.companyContext,
  });
}

export async function getAllChatLogs(limit = 100): Promise<ChatLogEntry[]> {
  const sb = getSupabase();
  try {
    const { data, error } = await sb
      .from('chat_logs')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return (data || []).map(row => ({
      timestamp: row.timestamp,
      userId: row.user_id,
      role: row.role as 'user' | 'assistant',
      message: row.message,
      companyContext: row.company_context,
    }));
  } catch {
    return [];
  }
}

// ===== Cache (no-op for backward compat) =====

export function clearCache(_key?: string): void {
  // No-op — Supabase queries are live, no client-side cache needed
}

// ===== Document Expiry Status (pure function, copied from sheets-parser.ts) =====

export function getDocumentExpiryStatus(expiryDateStr?: string): 'expired' | 'expiring-7d' | 'expiring-30d' | 'ok' | null {
  if (!expiryDateStr) return null;

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
