import { Router, Request, Response } from 'express';
import { Client } from '@line/bot-sdk';
import { parseCompanySheet, getAccessibleCompanies, getVersionHistory, getPermissions, updatePermissions, listCompanySheets, getUserPermission } from '@company-bot/shared';
import { buildApprovalRequest, buildCompanyAccessApproval } from '../flex/registration';
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

/** Get all company names for LIFF request-access page */
liffApiRouter.get('/companies', async (_req: Request, res: Response) => {
  try {
    const companies = await listCompanySheets();
    res.json(companies);
  } catch (err: any) {
    console.error('List companies error:', err.message);
    res.status(500).json({ error: 'Failed to list companies' });
  }
});

/** Request access to companies via LIFF */
liffApiRouter.post('/request-access', async (req: Request, res: Response) => {
  try {
    const { userId, companies } = req.body as { userId: string; companies: string[] };

    if (!userId || !companies || companies.length === 0) {
      res.status(400).json({ error: 'userId and companies are required' });
      return;
    }

    const allPerms = await getPermissions();
    const userPerm = allPerms.find(p => p.lineUserId === userId);
    if (!userPerm) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!userPerm.approved) {
      res.status(403).json({ error: 'User not approved yet' });
      return;
    }
    if (userPerm.pendingCompanies) {
      res.status(409).json({ error: 'already_pending', message: 'คุณมีคำขอที่รออนุมัติอยู่แล้ว' });
      return;
    }

    // Save pending companies
    userPerm.pendingCompanies = companies.join(',');
    await updatePermissions(allPerms);

    // Notify all super_admins
    try {
      const client = new Client({
        channelAccessToken: config.lineChannelAccessToken,
        channelSecret: config.lineChannelSecret,
      });

      const superAdmins = allPerms.filter(p => p.role === 'super_admin' && p.approved !== false);
      const approvalFlex = buildCompanyAccessApproval(userId, userPerm.displayName, companies, userPerm.pictureUrl);
      await Promise.allSettled(
        superAdmins.map(admin =>
          client.pushMessage(admin.lineUserId, approvalFlex)
        )
      );
    } catch (err) {
      console.error('Failed to notify super_admins:', err);
    }

    res.json({ success: true, message: 'ส่งคำขอสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ' });
  } catch (err: any) {
    console.error('Request access error:', err.message);
    res.status(500).json({ error: 'Request failed' });
  }
});
