import { Router, Request, Response } from 'express';
import { Client } from '@line/bot-sdk';
import { parseCompanySheet, getAccessibleCompanies, getVersionHistory, getPermissions, updatePermissions } from '@company-bot/shared';
import { buildApprovalRequest } from '../flex/registration';
import { config } from '../config';

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

/** Register new user via LIFF */
liffApiRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { userId, displayName, pictureUrl } = req.body;

    if (!userId || !displayName) {
      res.status(400).json({ error: 'userId and displayName are required' });
      return;
    }

    // Check if already registered
    const allPerms = await getPermissions();
    const existing = allPerms.find(p => p.lineUserId === userId);
    if (existing) {
      res.status(409).json({ error: 'already_registered', message: 'คุณได้สมัครไว้แล้ว' });
      return;
    }

    // Add new user as viewer with approved=false
    allPerms.push({
      lineUserId: userId,
      displayName,
      role: 'viewer',
      canViewDocuments: true,
      approved: false,
      pictureUrl: pictureUrl || undefined,
      companies: {},
    });
    await updatePermissions(allPerms);

    // Notify all super_admins
    try {
      const client = new Client({
        channelAccessToken: config.lineChannelAccessToken,
        channelSecret: config.lineChannelSecret,
      });

      const superAdmins = allPerms.filter(p => p.role === 'super_admin' && p.approved !== false);
      const approvalFlex = buildApprovalRequest(userId, displayName, pictureUrl);
      await Promise.allSettled(
        superAdmins.map(admin =>
          client.pushMessage(admin.lineUserId, approvalFlex)
        )
      );
    } catch (err) {
      console.error('Failed to notify super_admins:', err);
    }

    res.json({ success: true, message: 'สมัครสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ' });
  } catch (err: any) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});
