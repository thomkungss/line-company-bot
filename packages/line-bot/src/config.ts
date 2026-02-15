export const config = {
  port: Number(process.env.PORT) || 3000,
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
  liffId: process.env.LIFF_ID || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  baseUrl: process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`,
};
