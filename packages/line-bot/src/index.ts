import express from 'express';
import path from 'path';
import { middleware } from '@line/bot-sdk';
import { config } from './config';
import { handleWebhook } from './routes/webhook';
import { liffApiRouter } from './routes/liff-api';
import { driveProxyRouter } from './services/drive';
import { startSyncCron } from './services/version';

const app = express();

// LINE webhook needs raw body — must be before json parser
app.post(
  '/webhook',
  middleware({ channelAccessToken: config.lineChannelAccessToken, channelSecret: config.lineChannelSecret }),
  handleWebhook
);

// JSON parser for other routes
app.use(express.json());

// Static LIFF pages
app.use('/liff', express.static(path.join(__dirname, 'liff')));

// API routes
app.use('/api/liff', liffApiRouter);
app.use('/api', driveProxyRouter);

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'line-company-bot' });
});

app.listen(config.port, () => {
  console.log(`LINE Bot server running on port ${config.port}`);
  startSyncCron();
});
