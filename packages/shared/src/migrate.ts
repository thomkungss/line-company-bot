/**
 * One-time migration script: Google Sheets → Supabase
 *
 * Usage:
 *   npx ts-node packages/shared/src/migrate.ts
 *
 * Requires env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SPREADSHEET_ID
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import {
  listCompanySheets as listSheets,
  parseCompanySheet as parseSheet,
  getPermissions as getSheetPermissions,
  getVersionHistory as getSheetVersions,
  getAllChatLogs as getSheetChatLogs,
} from './sheets-parser';
import { getSupabase } from './supabase';

async function migrate() {
  const sb = getSupabase();
  console.log('=== Starting migration: Google Sheets → Supabase ===\n');

  // 1. Migrate companies + directors + shareholders + documents
  const sheetNames = await listSheets();
  console.log(`Found ${sheetNames.length} companies to migrate.\n`);

  let companyCount = 0;
  let directorCount = 0;
  let shareholderCount = 0;
  let documentCount = 0;

  for (const name of sheetNames) {
    try {
      const co = await parseSheet(name);
      console.log(`  Migrating: ${name} (${co.companyNameTh})`);

      // Insert company
      const { data: inserted, error: coErr } = await sb
        .from('companies')
        .insert({
          sheet_name: co.sheetName,
          data_date: co.dataDate,
          company_name_th: co.companyNameTh,
          company_name_en: co.companyNameEn,
          registration_number: co.registrationNumber,
          director_count: co.directorCount,
          authorized_signatory: co.authorizedSignatory,
          registered_capital: co.registeredCapital,
          capital_text: co.capitalText,
          total_shares: co.shareBreakdown.totalShares,
          par_value: co.shareBreakdown.parValue,
          paid_up_shares: co.shareBreakdown.paidUpShares,
          paid_up_amount: co.shareBreakdown.paidUpAmount,
          head_office_address: co.headOfficeAddress,
          objectives: co.objectives,
          seal_image_drive_id: co.sealImageDriveId,
          seal_image_url: co.sealImageUrl,
        })
        .select('id')
        .single();

      if (coErr) {
        console.error(`    ERROR inserting company: ${coErr.message}`);
        continue;
      }
      const companyId = inserted!.id;
      companyCount++;

      // Insert directors
      if (co.directors.length > 0) {
        const dirRows = co.directors.map((d, i) => ({
          company_id: companyId,
          name: d.name,
          position: d.position || null,
          sort_order: i + 1,
        }));
        const { error: dirErr } = await sb.from('directors').insert(dirRows);
        if (dirErr) console.error(`    ERROR inserting directors: ${dirErr.message}`);
        else directorCount += co.directors.length;
      }

      // Insert shareholders
      if (co.shareholders.length > 0) {
        const shRows = co.shareholders.map(s => ({
          company_id: companyId,
          sort_order: s.order,
          name: s.name,
          shares: s.shares,
          percentage: s.percentage ?? null,
        }));
        const { error: shErr } = await sb.from('shareholders').insert(shRows);
        if (shErr) console.error(`    ERROR inserting shareholders: ${shErr.message}`);
        else shareholderCount += co.shareholders.length;
      }

      // Insert documents
      if (co.documents.length > 0) {
        const docRows = co.documents.map(d => ({
          company_id: companyId,
          name: d.name,
          drive_file_id: d.driveFileId || '',
          type: d.type || null,
          drive_url: d.driveUrl || null,
          updated_date: d.updatedDate || null,
          expiry_date: d.expiryDate || null,
        }));
        const { error: docErr } = await sb.from('company_documents').insert(docRows);
        if (docErr) console.error(`    ERROR inserting documents: ${docErr.message}`);
        else documentCount += co.documents.length;
      }

      console.log(`    ✓ ${co.directors.length} directors, ${co.shareholders.length} shareholders, ${co.documents.length} documents`);
    } catch (err: any) {
      console.error(`  ERROR migrating ${name}: ${err.message}`);
    }
  }

  console.log(`\nCompanies: ${companyCount}, Directors: ${directorCount}, Shareholders: ${shareholderCount}, Documents: ${documentCount}\n`);

  // 2. Migrate permissions
  console.log('Migrating permissions...');
  try {
    const permissions = await getSheetPermissions();
    console.log(`  Found ${permissions.length} users.`);

    // Build company ID lookup
    const { data: companies } = await sb.from('companies').select('id, sheet_name');
    const companyIdMap: Record<string, number> = {};
    for (const c of companies || []) {
      companyIdMap[c.sheet_name] = c.id;
    }

    for (const p of permissions) {
      const { data: userInserted, error: userErr } = await sb
        .from('user_permissions')
        .insert({
          line_user_id: p.lineUserId,
          display_name: p.displayName,
          role: p.role,
          can_view_documents: p.canViewDocuments !== false,
          can_download_documents: p.canDownloadDocuments !== false,
          approved: p.approved !== false,
          picture_url: p.pictureUrl || null,
          pending_companies: p.pendingCompanies || null,
        })
        .select('id')
        .single();

      if (userErr) {
        console.error(`    ERROR inserting user ${p.displayName}: ${userErr.message}`);
        continue;
      }

      // Insert company access
      const accessRows: { user_id: number; company_id: number }[] = [];
      for (const [companyName, hasAccess] of Object.entries(p.companies)) {
        if (!hasAccess) continue;
        const companyId = companyIdMap[companyName];
        if (!companyId) continue;
        accessRows.push({ user_id: userInserted!.id, company_id: companyId });
      }

      if (accessRows.length > 0) {
        const { error: accessErr } = await sb.from('user_company_access').insert(accessRows);
        if (accessErr) console.error(`    ERROR inserting access for ${p.displayName}: ${accessErr.message}`);
      }

      console.log(`    ✓ ${p.displayName} (${p.role}) — ${accessRows.length} companies`);
    }
  } catch (err: any) {
    console.error(`  ERROR migrating permissions: ${err.message}`);
  }

  // 3. Migrate version history
  console.log('\nMigrating version history...');
  try {
    const versions = await getSheetVersions();
    console.log(`  Found ${versions.length} version entries.`);

    if (versions.length > 0) {
      // Reverse back to chronological order for insertion (getVersionHistory returns newest first)
      const chronological = [...versions].reverse();
      // Insert in batches of 500
      for (let i = 0; i < chronological.length; i += 500) {
        const batch = chronological.slice(i, i + 500).map(v => ({
          timestamp: v.timestamp,
          company_sheet: v.companySheet,
          field_changed: v.fieldChanged,
          old_value: v.oldValue,
          new_value: v.newValue,
          changed_by: v.changedBy,
        }));
        const { error } = await sb.from('version_history').insert(batch);
        if (error) console.error(`    ERROR inserting version batch: ${error.message}`);
      }
      console.log(`    ✓ ${versions.length} entries migrated.`);
    }
  } catch (err: any) {
    console.error(`  ERROR migrating versions: ${err.message}`);
  }

  // 4. Migrate chat logs
  console.log('\nMigrating chat logs...');
  try {
    const chatLogs = await getSheetChatLogs(10000); // high limit to get all
    console.log(`  Found ${chatLogs.length} chat log entries.`);

    if (chatLogs.length > 0) {
      // getAllChatLogs returns newest first, reverse for chronological insertion
      const chronological = [...chatLogs].reverse();
      for (let i = 0; i < chronological.length; i += 500) {
        const batch = chronological.slice(i, i + 500).map(c => ({
          timestamp: c.timestamp,
          user_id: c.userId,
          role: c.role,
          message: c.message,
          company_context: c.companyContext,
        }));
        const { error } = await sb.from('chat_logs').insert(batch);
        if (error) console.error(`    ERROR inserting chat batch: ${error.message}`);
      }
      console.log(`    ✓ ${chatLogs.length} entries migrated.`);
    }
  } catch (err: any) {
    console.error(`  ERROR migrating chat logs: ${err.message}`);
  }

  // 5. Verification
  console.log('\n=== Verification ===');
  const counts = await Promise.all([
    sb.from('companies').select('*', { count: 'exact', head: true }),
    sb.from('directors').select('*', { count: 'exact', head: true }),
    sb.from('shareholders').select('*', { count: 'exact', head: true }),
    sb.from('company_documents').select('*', { count: 'exact', head: true }),
    sb.from('user_permissions').select('*', { count: 'exact', head: true }),
    sb.from('user_company_access').select('*', { count: 'exact', head: true }),
    sb.from('version_history').select('*', { count: 'exact', head: true }),
    sb.from('chat_logs').select('*', { count: 'exact', head: true }),
  ]);

  const tables = ['companies', 'directors', 'shareholders', 'company_documents', 'user_permissions', 'user_company_access', 'version_history', 'chat_logs'];
  tables.forEach((name, i) => {
    console.log(`  ${name}: ${counts[i].count} rows`);
  });

  console.log('\n=== Migration complete! ===');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
