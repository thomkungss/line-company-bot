/**
 * Migration script: Google Drive → Supabase Storage
 *
 * Migrates existing company documents and seal images from Google Drive
 * to Supabase Storage buckets.
 *
 * Usage:
 *   npx tsx packages/shared/src/migrate-storage.ts [--dry-run]
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON
 */

import 'dotenv/config';
import { getSupabase, uploadToStorage, getPublicUrl, sanitizeStorageName } from './supabase';
import { getDriveClient } from './google-auth';
import { Readable } from 'stream';

const DRY_RUN = process.argv.includes('--dry-run');

interface MigrationResult {
  documentsTotal: number;
  documentsSuccess: number;
  documentsFailed: number;
  documentsSkipped: number;
  sealsTotal: number;
  sealsSuccess: number;
  sealsFailed: number;
}

async function downloadDriveFile(drive: any, fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
  const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
  const fileName = (meta as any).data?.name || 'document';

  const exportTypes: Record<string, string> = {
    'application/vnd.google-apps.document': 'application/pdf',
    'application/vnd.google-apps.spreadsheet': 'application/pdf',
    'application/vnd.google-apps.presentation': 'application/pdf',
  };

  let fileRes;
  let finalMimeType = mimeType;
  if (exportTypes[mimeType]) {
    fileRes = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'stream' }
    );
    finalMimeType = 'application/pdf';
  } else {
    fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = (fileRes as any).data as Readable;
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  return { buffer: Buffer.concat(chunks), mimeType: finalMimeType, fileName };
}

function getMimeExt(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return map[mimeType] || '';
}

/** Check if a drive_file_id looks like a real Drive ID (not a placeholder like "ลิงก์") */
function isValidDriveId(id: string): boolean {
  return /^[a-zA-Z0-9_\-]{10,}$/.test(id);
}

async function migrateDocuments(drive: any, result: MigrationResult): Promise<void> {
  const sb = getSupabase();

  // Find documents with drive_file_id but no storage_path
  const { data: docs, error } = await sb
    .from('company_documents')
    .select('id, name, drive_file_id, company_id, companies(sheet_name)')
    .neq('drive_file_id', '')
    .eq('storage_path', '');

  if (error) {
    console.error('Error querying documents:', error.message);
    return;
  }

  result.documentsTotal = (docs || []).length;
  console.log(`\nDocuments to migrate: ${result.documentsTotal}`);

  for (const doc of docs || []) {
    const sheetName = (doc as any).companies?.sheet_name || 'unknown';
    const docName = doc.name || 'unnamed';
    const companyId = String(doc.company_id);

    // Skip non-Drive IDs (e.g. "ลิงก์")
    if (!isValidDriveId(doc.drive_file_id)) {
      console.log(`  [SKIP] ${sheetName}/${docName} — not a valid Drive ID: "${doc.drive_file_id}"`);
      result.documentsSkipped++;
      continue;
    }

    console.log(`  [DOC] ${sheetName}/${docName} (drive: ${doc.drive_file_id})`);

    if (DRY_RUN) {
      result.documentsSuccess++;
      continue;
    }

    try {
      const { buffer, mimeType } = await downloadDriveFile(drive, doc.drive_file_id);
      const ext = getMimeExt(mimeType) || '.pdf';
      const safeName = sanitizeStorageName(docName);
      // Use company DB ID as folder (ASCII-safe)
      const storagePath = `${companyId}/${safeName}${ext}`;

      await uploadToStorage('documents', storagePath, buffer, mimeType);

      // Update DB
      await sb
        .from('company_documents')
        .update({ storage_path: storagePath })
        .eq('id', doc.id);

      console.log(`    ✓ Migrated → ${storagePath} (${buffer.length} bytes)`);
      result.documentsSuccess++;
    } catch (err: any) {
      console.error(`    ✗ Failed: ${err.message}`);
      result.documentsFailed++;
    }
  }
}

async function migrateSeals(drive: any, result: MigrationResult): Promise<void> {
  const sb = getSupabase();

  // Find companies with seal_image_drive_id but no seal_storage_path
  const { data: companies, error } = await sb
    .from('companies')
    .select('id, sheet_name, seal_image_drive_id')
    .neq('seal_image_drive_id', '')
    .eq('seal_storage_path', '');

  if (error) {
    console.error('Error querying companies:', error.message);
    return;
  }

  result.sealsTotal = (companies || []).length;
  console.log(`\nSeals to migrate: ${result.sealsTotal}`);

  for (const co of companies || []) {
    console.log(`  [SEAL] ${co.sheet_name} (drive: ${co.seal_image_drive_id})`);

    if (DRY_RUN) {
      result.sealsSuccess++;
      continue;
    }

    try {
      const { buffer, mimeType } = await downloadDriveFile(drive, co.seal_image_drive_id);
      const ext = getMimeExt(mimeType) || '.png';
      // Use company DB ID as folder (ASCII-safe)
      const storagePath = `${co.id}/seal${ext}`;

      await uploadToStorage('seals', storagePath, buffer, mimeType);
      const publicUrl = getPublicUrl('seals', storagePath);

      // Update DB
      await sb
        .from('companies')
        .update({
          seal_storage_path: storagePath,
          seal_storage_url: publicUrl,
        })
        .eq('id', co.id);

      console.log(`    ✓ Migrated → ${storagePath} (${buffer.length} bytes)`);
      console.log(`    URL: ${publicUrl}`);
      result.sealsSuccess++;
    } catch (err: any) {
      console.error(`    ✗ Failed: ${err.message}`);
      result.sealsFailed++;
    }
  }
}

async function main() {
  console.log('=== Google Drive → Supabase Storage Migration ===');
  if (DRY_RUN) {
    console.log('*** DRY RUN MODE — no files will be uploaded ***\n');
  }

  const drive = getDriveClient();
  const result: MigrationResult = {
    documentsTotal: 0, documentsSuccess: 0, documentsFailed: 0, documentsSkipped: 0,
    sealsTotal: 0, sealsSuccess: 0, sealsFailed: 0,
  };

  await migrateDocuments(drive, result);
  await migrateSeals(drive, result);

  console.log('\n=== Migration Summary ===');
  console.log(`Documents: ${result.documentsSuccess}/${result.documentsTotal} success, ${result.documentsFailed} failed, ${result.documentsSkipped} skipped`);
  console.log(`Seals:     ${result.sealsSuccess}/${result.sealsTotal} success, ${result.sealsFailed} failed`);

  if (DRY_RUN) {
    console.log('\n(Dry run — re-run without --dry-run to execute)');
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
