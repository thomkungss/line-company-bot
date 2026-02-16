import { Router, Request, Response } from 'express';
import { getPermissions, updatePermissions, listCompanySheets } from '@company-bot/shared';

export const permissionsRouter = Router();

/** Get all permissions */
permissionsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const [permissions, companySheets] = await Promise.all([
      getPermissions(),
      listCompanySheets(),
    ]);
    res.json({ permissions, companySheets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Update permissions */
permissionsRouter.put('/', async (req: Request, res: Response) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions array required' });
      return;
    }
    await updatePermissions(permissions);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
