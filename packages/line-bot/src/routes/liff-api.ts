import { Router, Request, Response } from 'express';
import { parseCompanySheet, getAccessibleCompanies, getVersionHistory } from '@company-bot/shared';

export const liffApiRouter = Router();

/** Get company detail for LIFF page */
liffApiRouter.get('/company/:sheetName', async (req: Request, res: Response) => {
  try {
    const sheetName: string = req.params.sheetName as string;
    const userId = (req.query.userId as string) || '';

    // Verify permission
    if (userId) {
      const accessible = await getAccessibleCompanies(userId);
      if (!accessible.includes(sheetName)) {
        res.status(403).json({ error: 'No permission' });
        return;
      }
    }

    const company = await parseCompanySheet(sheetName);
    res.json(company);
  } catch (err: any) {
    console.error('LIFF API error:', err.message);
    res.status(500).json({ error: 'Failed to load company data' });
  }
});

/** Get version history for LIFF page */
liffApiRouter.get('/versions/:sheetName', async (req: Request, res: Response) => {
  try {
    const sheetName: string = req.params.sheetName as string;
    const versions = await getVersionHistory(sheetName);
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load versions' });
  }
});
