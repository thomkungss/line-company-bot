import { Router, Request, Response } from 'express';
import { getVersionHistory } from '@company-bot/shared';

export const versionsRouter = Router();

/** Get all version history */
versionsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const versions = await getVersionHistory();
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get version history for a specific company */
versionsRouter.get('/:sheet', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const versions = await getVersionHistory(sheet);
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
