import { Router, Request, Response } from 'express';
import { listCompanySheets, parseCompanySheet, updateCompanyField, appendVersion, thaiNow } from '@company-bot/shared';

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
