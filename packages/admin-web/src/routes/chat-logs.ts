import { Router, Request, Response } from 'express';
import { getAllChatLogs } from '@company-bot/shared';

export const chatLogsRouter = Router();

/** Get all chat logs */
chatLogsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const logs = await getAllChatLogs(200);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
