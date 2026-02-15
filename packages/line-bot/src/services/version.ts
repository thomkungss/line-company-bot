import cron from 'node-cron';
import {
  listCompanySheets, parseCompanySheet, getVersionHistory,
  appendVersion, thaiNow, Company, VersionEntry
} from '@company-bot/shared';

// In-memory cache of last known company data for diff
const companyCache = new Map<string, Company>();

export async function syncAndTrackChanges(): Promise<VersionEntry[]> {
  const changes: VersionEntry[] = [];
  const now = thaiNow();

  try {
    const sheetNames = await listCompanySheets();

    for (const name of sheetNames) {
      try {
        const current = await parseCompanySheet(name);
        const cached = companyCache.get(name);

        if (cached) {
          // Compare fields
          const fieldsToCheck: { key: keyof Company; label: string }[] = [
            { key: 'companyNameTh', label: 'ชื่อบริษัท' },
            { key: 'companyNameEn', label: 'Company Name' },
            { key: 'registrationNumber', label: 'เลขทะเบียน' },
            { key: 'authorizedSignatory', label: 'อำนาจกรรมการ' },
            { key: 'registeredCapital', label: 'ทุนจดทะเบียน' },
            { key: 'headOfficeAddress', label: 'ที่ตั้งสำนักงานใหญ่' },
            { key: 'objectives', label: 'วัตถุประสงค์' },
          ];

          for (const { key, label } of fieldsToCheck) {
            const oldVal = String(cached[key] || '');
            const newVal = String(current[key] || '');
            if (oldVal !== newVal && (oldVal || newVal)) {
              const entry: VersionEntry = {
                timestamp: now,
                companySheet: name,
                fieldChanged: label,
                oldValue: oldVal,
                newValue: newVal,
                changedBy: 'system-sync',
              };
              changes.push(entry);
              await appendVersion(entry);
            }
          }

          // Director changes
          const oldDirs = cached.directors.map(d => d.name).sort().join(',');
          const newDirs = current.directors.map(d => d.name).sort().join(',');
          if (oldDirs !== newDirs) {
            const entry: VersionEntry = {
              timestamp: now,
              companySheet: name,
              fieldChanged: 'กรรมการ',
              oldValue: oldDirs,
              newValue: newDirs,
              changedBy: 'system-sync',
            };
            changes.push(entry);
            await appendVersion(entry);
          }

          // Shareholder changes
          const oldSH = cached.shareholders.map(s => `${s.name}:${s.shares}`).sort().join(',');
          const newSH = current.shareholders.map(s => `${s.name}:${s.shares}`).sort().join(',');
          if (oldSH !== newSH) {
            const entry: VersionEntry = {
              timestamp: now,
              companySheet: name,
              fieldChanged: 'ผู้ถือหุ้น',
              oldValue: oldSH,
              newValue: newSH,
              changedBy: 'system-sync',
            };
            changes.push(entry);
            await appendVersion(entry);
          }
        }

        // Update cache
        companyCache.set(name, current);
      } catch (err) {
        console.error(`Error syncing ${name}:`, err);
      }
    }
  } catch (err) {
    console.error('Sync error:', err);
  }

  if (changes.length > 0) {
    console.log(`Sync found ${changes.length} changes`);
  }
  return changes;
}

/** Initial load — populate cache without generating version entries */
export async function initialLoad(): Promise<void> {
  try {
    const sheetNames = await listCompanySheets();
    for (const name of sheetNames) {
      try {
        const company = await parseCompanySheet(name);
        companyCache.set(name, company);
      } catch (err) {
        console.error(`Error loading ${name}:`, err);
      }
    }
    console.log(`Loaded ${companyCache.size} companies into cache`);
  } catch (err) {
    console.error('Initial load error:', err);
  }
}

/** Start the cron job for periodic sync (every 6 hours) */
export function startSyncCron(): void {
  // Initial load
  initialLoad();

  // Sync every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('Running scheduled sync...');
    syncAndTrackChanges();
  });

  console.log('Sync cron started (every 6 hours)');
}
