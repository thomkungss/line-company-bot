import cron from 'node-cron';
import { Client } from '@line/bot-sdk';
import {
  listCompanySheets, parseCompanySheet, getVersionHistory,
  appendVersion, thaiNow, Company, VersionEntry,
  getDocumentExpiryStatus, getPermissions,
} from '@company-bot/shared';
import { config } from '../config';

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

// ===== Document Expiry Check =====

// Track which notifications have been sent to avoid duplicates within a cycle
const notifiedExpiry = new Set<string>();

interface ExpiringDoc {
  sheetName: string;
  companyNameTh: string;
  docName: string;
  expiryDate: string;
  status: 'expiring-7d' | 'expiring-30d';
}

export async function checkDocumentExpiry(): Promise<void> {
  try {
    const sheetNames = await listCompanySheets();
    const expiringDocs: ExpiringDoc[] = [];

    for (const name of sheetNames) {
      try {
        const company = await parseCompanySheet(name);
        for (const doc of company.documents) {
          if (!doc.expiryDate) continue;
          const status = getDocumentExpiryStatus(doc.expiryDate);
          if (status !== 'expiring-7d' && status !== 'expiring-30d') continue;

          const key = `${name}|${doc.name}|${status}`;
          if (notifiedExpiry.has(key)) continue;

          expiringDocs.push({
            sheetName: name,
            companyNameTh: company.companyNameTh || name,
            docName: doc.name,
            expiryDate: doc.expiryDate,
            status,
          });
          notifiedExpiry.add(key);
        }
      } catch (err) {
        console.error(`Error checking expiry for ${name}:`, err);
      }
    }

    if (expiringDocs.length === 0) {
      console.log('No expiring documents found');
      return;
    }

    console.log(`Found ${expiringDocs.length} expiring documents`);

    // Get admin/super_admin users
    const permissions = await getPermissions();
    const adminUsers = permissions.filter(
      p => (p.role === 'admin' || p.role === 'super_admin') && p.lineUserId && p.approved !== false
    );

    if (adminUsers.length === 0) {
      console.log('No admin users to notify');
      return;
    }

    // Build LINE Flex Message
    const flexMessage = buildExpiryFlexMessage(expiringDocs);

    const client = new Client({
      channelAccessToken: config.lineChannelAccessToken,
      channelSecret: config.lineChannelSecret,
    });

    // Push to all admin users
    for (const admin of adminUsers) {
      try {
        await client.pushMessage(admin.lineUserId, flexMessage);
        console.log(`Expiry notification sent to ${admin.displayName}`);
      } catch (err) {
        console.error(`Failed to send expiry notification to ${admin.displayName}:`, err);
      }
    }
  } catch (err) {
    console.error('checkDocumentExpiry error:', err);
  }
}

function buildExpiryFlexMessage(docs: ExpiringDoc[]): any {
  // Group by company
  const grouped: Record<string, ExpiringDoc[]> = {};
  for (const doc of docs) {
    if (!grouped[doc.companyNameTh]) grouped[doc.companyNameTh] = [];
    grouped[doc.companyNameTh].push(doc);
  }

  const bodyContents: any[] = [
    {
      type: 'text',
      text: 'เอกสารใกล้หมดอายุ',
      weight: 'bold',
      size: 'lg',
      color: '#E65100',
    },
    {
      type: 'text',
      text: `พบ ${docs.length} เอกสารที่ใกล้หมดอายุ`,
      size: 'sm',
      color: '#999999',
      margin: 'sm',
    },
    { type: 'separator', margin: 'lg' },
  ];

  for (const [company, companyDocs] of Object.entries(grouped)) {
    bodyContents.push({
      type: 'text',
      text: company,
      weight: 'bold',
      size: 'sm',
      margin: 'lg',
      color: '#1DB446',
    });

    for (const doc of companyDocs) {
      const statusText = doc.status === 'expiring-7d' ? '7 วัน' : '30 วัน';
      const statusColor = doc.status === 'expiring-7d' ? '#E65100' : '#F57F17';
      bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          {
            type: 'text',
            text: doc.docName,
            size: 'xs',
            color: '#333333',
            flex: 3,
            wrap: true,
          },
          {
            type: 'text',
            text: `หมดอายุใน ${statusText}`,
            size: 'xxs',
            color: statusColor,
            flex: 2,
            align: 'end',
          },
        ],
      });
      bodyContents.push({
        type: 'text',
        text: `วันหมดอายุ: ${doc.expiryDate}`,
        size: 'xxs',
        color: '#AAAAAA',
        margin: 'none',
      });
    }
  }

  return {
    type: 'flex',
    altText: `เอกสารใกล้หมดอายุ ${docs.length} รายการ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#E65100',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: 'แจ้งเตือนเอกสารหมดอายุ',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'md',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
        paddingAll: 'lg',
      },
    },
  };
}

/** Start the cron job for periodic sync (every 6 hours) + daily expiry check */
export function startSyncCron(): void {
  // Initial load
  initialLoad();

  // Sync every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('Running scheduled sync...');
    syncAndTrackChanges();
  });

  // Daily expiry check at 9 AM Bangkok time (ICT = UTC+7, so 9 AM ICT = 2 AM UTC)
  cron.schedule('0 2 * * *', () => {
    console.log('Running daily document expiry check...');
    // Clear notification cache daily so same docs get re-notified next day if still expiring
    notifiedExpiry.clear();
    checkDocumentExpiry();
  });

  console.log('Sync cron started (every 6 hours) + expiry check (daily 9AM Bangkok)');
}
