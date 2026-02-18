export const config = {
  port: Number(process.env.PORT) || 3001,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  sessionSecret: process.env.SESSION_SECRET || 'company-bot-admin-secret-key',
  baseUrl: process.env.ADMIN_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3001}`,
  liffId: process.env.LIFF_ID || '',
  lineBotBaseUrl: process.env.LINE_BOT_BASE_URL || '',
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
};
