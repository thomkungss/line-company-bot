import { Router, Request, Response } from 'express';
import {
  listCompanySheets, parseCompanySheet, updateCompanyField, appendVersion, thaiNow,
  createCompanySheet, deleteCompanySheet, updateDirectors, updateShareholders,
  getPermissions, updatePermissions, getDocumentExpiryStatus,
} from '@company-bot/shared';
import { Director, Shareholder } from '@company-bot/shared';

export const companiesRouter = Router();

/** List all company sheet names */
companiesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const names = await listCompanySheets();
    // Load basic info for each
    const companies = await Promise.all(
      names.map(async (name) => {
        try {
          const c = await parseCompanySheet(name);
          return {
            sheetName: c.sheetName,
            companyNameTh: c.companyNameTh,
            companyNameEn: c.companyNameEn,
            registrationNumber: c.registrationNumber,
            registeredCapital: c.registeredCapital,
            directorCount: c.directors.length,
            shareholderCount: c.shareholders.length,
            documentCount: c.documents.length,
          };
        } catch {
          return { sheetName: name, companyNameTh: name, error: true };
        }
      })
    );
    res.json(companies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Create new company */
companiesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { sheetName } = req.body;
    if (!sheetName || typeof sheetName !== 'string' || !sheetName.trim()) {
      res.status(400).json({ error: 'sheetName is required' });
      return;
    }

    const trimmed = sheetName.trim();

    // Check for duplicate
    const existing = await listCompanySheets();
    if (existing.includes(trimmed)) {
      res.status(409).json({ error: `Sheet "${trimmed}" already exists` });
      return;
    }

    const result = await createCompanySheet(trimmed);

    await appendVersion({
      timestamp: thaiNow(),
      companySheet: trimmed,
      fieldChanged: 'สร้างบริษัทใหม่',
      oldValue: '',
      newValue: trimmed,
      changedBy: 'admin',
    });

    // Auto-update permissions sheet to include new company column
    try { const perms = await getPermissions(); await updatePermissions(perms); } catch {}

    res.json({ success: true, sheetName: trimmed, driveFolderId: result.driveFolderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Bulk create companies from CSV */
companiesRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { companies } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      res.status(400).json({ error: 'companies array is required' });
      return;
    }

    // Get existing sheets to check for duplicates
    const existing = await listCompanySheets();
    const existingSet = new Set(existing);
    const createdSet = new Set<string>();

    const results: { sheetName: string; success: boolean; error?: string }[] = [];
    let created = 0;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (const c of companies) {
      const sheetName = (c.sheetName || '').trim();
      if (!sheetName) {
        results.push({ sheetName: sheetName || '(ว่าง)', success: false, error: 'ชื่อ Sheet ว่าง' });
        continue;
      }
      if (existingSet.has(sheetName) || createdSet.has(sheetName)) {
        results.push({ sheetName, success: false, error: 'ชื่อซ้ำ' });
        continue;
      }

      try {
        // 1. Create sheet + template + Drive folder
        await createCompanySheet(sheetName);

        // 2. Update general fields
        const fields: [string, string][] = [
          ['ชื่อบริษัท', c.companyNameTh || ''],
          ['Company Name', c.companyNameEn || ''],
          ['เลขทะเบียนนิติบุคคล', c.registrationNumber || ''],
          ['ทุนจดทะเบียน', c.capitalText || ''],
          ['อำนาจกรรมการ', c.authorizedSignatory || ''],
          ['ที่ตั้งสำนักงานใหญ่', c.headOfficeAddress || ''],
          ['วัตถุประสงค์', c.objectives || ''],
        ];
        for (const [label, value] of fields) {
          if (value) await updateCompanyField(sheetName, label, value);
        }

        // 3. Update directors
        if (Array.isArray(c.directors) && c.directors.length > 0) {
          await updateDirectors(sheetName, c.directors);
        }

        // 4. Update shareholders
        if (Array.isArray(c.shareholders) && c.shareholders.length > 0) {
          await updateShareholders(sheetName, c.shareholders);
        }

        // 5. Log version
        await appendVersion({
          timestamp: thaiNow(),
          companySheet: sheetName,
          fieldChanged: 'สร้างบริษัทใหม่ (CSV)',
          oldValue: '',
          newValue: sheetName,
          changedBy: 'admin',
        });

        createdSet.add(sheetName);
        created++;
        results.push({ sheetName, success: true });
      } catch (err: any) {
        results.push({ sheetName, success: false, error: err.message });
      }

      // Delay between companies to avoid Google API rate limits
      await delay(500);
    }

    // Auto-update permissions sheet to include new company columns
    if (created > 0) {
      try { const perms = await getPermissions(); await updatePermissions(perms); } catch {}
    }

    res.json({ total: companies.length, created, failed: companies.length - created, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get all companies with their shareholders and directors for mapping visualization */
companiesRouter.get('/mapping', async (_req: Request, res: Response) => {
  try {
    const names = await listCompanySheets();
    const companies = await Promise.all(
      names.map(async (name) => {
        try {
          const c = await parseCompanySheet(name);
          return {
            sheetName: c.sheetName,
            companyNameTh: c.companyNameTh,
            directors: c.directors.filter(d => d.name).map(d => ({ name: d.name, position: d.position || '' })),
            shareholders: c.shareholders.filter(s => s.name).map(s => ({ name: s.name, shares: s.shares || 0, percentage: s.percentage || 0 })),
          };
        } catch {
          return null;
        }
      })
    );
    res.json({ companies: companies.filter(Boolean) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get all unique director + shareholder names across all companies */
companiesRouter.get('/all-people', async (_req: Request, res: Response) => {
  try {
    const names = await listCompanySheets();
    const directorNames = new Set<string>();
    const shareholderNames = new Set<string>();

    await Promise.all(
      names.map(async (name) => {
        try {
          const c = await parseCompanySheet(name);
          c.directors.forEach(d => { if (d.name) directorNames.add(d.name); });
          c.shareholders.forEach(s => { if (s.name) shareholderNames.add(s.name); });
        } catch {}
      })
    );

    res.json({
      directors: [...directorNames].sort(),
      shareholders: [...shareholderNames].sort(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get all expiring/expired documents across all companies */
companiesRouter.get('/expiring', async (_req: Request, res: Response) => {
  try {
    const names = await listCompanySheets();
    const results: { sheetName: string; companyNameTh: string; docName: string; expiryDate: string; status: string }[] = [];

    await Promise.all(
      names.map(async (name) => {
        try {
          const c = await parseCompanySheet(name);
          for (const doc of c.documents) {
            if (!doc.expiryDate) continue;
            const status = getDocumentExpiryStatus(doc.expiryDate);
            if (status === 'expired' || status === 'expiring-7d' || status === 'expiring-30d') {
              results.push({
                sheetName: c.sheetName,
                companyNameTh: c.companyNameTh || c.sheetName,
                docName: doc.name,
                expiryDate: doc.expiryDate,
                status,
              });
            }
          }
        } catch {}
      })
    );

    // Sort: expired first, then expiring-7d, then expiring-30d
    const order: Record<string, number> = { 'expired': 0, 'expiring-7d': 1, 'expiring-30d': 2 };
    results.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get full company data by sheet name */
companiesRouter.get('/:sheet', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const company = await parseCompanySheet(sheet);
    res.json(company);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Update company field */
companiesRouter.put('/:sheet', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const { label, value } = req.body;

    if (!label || value === undefined) {
      res.status(400).json({ error: 'label and value are required' });
      return;
    }

    const result = await updateCompanyField(sheet, label, value);
    if (!result) {
      res.status(404).json({ error: `Field "${label}" not found in sheet` });
      return;
    }

    // Log version change
    await appendVersion({
      timestamp: thaiNow(),
      companySheet: sheet,
      fieldChanged: label,
      oldValue: result.oldValue,
      newValue: value,
      changedBy: 'admin',
    });

    res.json({ success: true, row: result.row, oldValue: result.oldValue });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Delete company */
companiesRouter.delete('/:sheet', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    await deleteCompanySheet(sheet);

    await appendVersion({
      timestamp: thaiNow(),
      companySheet: sheet,
      fieldChanged: 'ลบบริษัท',
      oldValue: sheet,
      newValue: '',
      changedBy: 'admin',
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Update directors */
companiesRouter.put('/:sheet/directors', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const { directors } = req.body as { directors: Director[] };

    if (!Array.isArray(directors)) {
      res.status(400).json({ error: 'directors array is required' });
      return;
    }

    // Get old data for version log
    const oldCompany = await parseCompanySheet(sheet);
    const oldNames = oldCompany.directors.map(d => d.name).join(', ');

    await updateDirectors(sheet, directors);

    const newNames = directors.map(d => d.name).join(', ');
    await appendVersion({
      timestamp: thaiNow(),
      companySheet: sheet,
      fieldChanged: 'กรรมการ',
      oldValue: oldNames || '-',
      newValue: newNames || '-',
      changedBy: 'admin',
    });

    res.json({ success: true, count: directors.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Update shareholders */
companiesRouter.put('/:sheet/shareholders', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const { shareholders } = req.body as { shareholders: Shareholder[] };

    if (!Array.isArray(shareholders)) {
      res.status(400).json({ error: 'shareholders array is required' });
      return;
    }

    // Get old data for version log
    const oldCompany = await parseCompanySheet(sheet);
    const oldNames = oldCompany.shareholders.map(s => s.name).join(', ');

    await updateShareholders(sheet, shareholders);

    const newNames = shareholders.map(s => s.name).join(', ');
    await appendVersion({
      timestamp: thaiNow(),
      companySheet: sheet,
      fieldChanged: 'ผู้ถือหุ้น',
      oldValue: oldNames || '-',
      newValue: newNames || '-',
      changedBy: 'admin',
    });

    res.json({ success: true, count: shareholders.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
