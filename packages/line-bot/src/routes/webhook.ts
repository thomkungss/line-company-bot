import { Request, Response } from 'express';
import { WebhookEvent, Client } from '@line/bot-sdk';
import { config } from '../config';
import { handleMessage } from '../handlers/message';
import { handlePostback } from '../handlers/postback';

const client = new Client({
  channelAccessToken: config.lineChannelAccessToken,
  channelSecret: config.lineChannelSecret,
});

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const events: WebhookEvent[] = (req.body as any).events || [];

  await Promise.allSettled(
    events.map(async (event) => {
      try {
        if (event.type === 'message' && event.message.type === 'text') {
          await handleMessage(client, event);
        } else if (event.type === 'postback') {
          await handlePostback(client, event);
        }
      } catch (err) {
        console.error('Error handling event:', err);
      }
    })
  );

  res.status(200).json({ status: 'ok' });
}
