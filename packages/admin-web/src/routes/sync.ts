import { Router, Request, Response } from 'express';
import { listCompanySheets, parseCompanySheet } from '@company-bot/shared';

export const syncRouter = Router();

/** Trigger manual sync / reload data */
syncRouter.post('/', async (_req: Request, res: Response) => {
  try {
    const names = await listCompanySheets();
    const results = await Promise.allSettled(
      names.map(async (name) => {
        const company = await parseCompanySheet(name);
        return { sheetName: name, success: true, companyNameTh: company.companyNameTh };
      })
    );

    const summary = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { sheetName: names[i], success: false, error: (r.reason as Error).message };
    });

    res.json({ synced: summary.length, results: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
