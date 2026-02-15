import { Client, MessageEvent, TextMessage, FlexMessage } from '@line/bot-sdk';
import { getAccessibleCompanies, getUserPermission, parseCompanySheet } from '@company-bot/shared';
import { handleCommand } from './command';
import { buildCompanySelectionCarousel } from '../flex/company-card';
import { handleAIChat } from '../services/claude';

export async function handleMessage(client: Client, event: MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;

  const userId = event.source.userId;
  if (!userId) return;

  const text = event.message.text.trim();

  // Check permissions
  const perm = await getUserPermission(userId);
  if (!perm) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาติดต่อผู้ดูแลระบบ',
    });
    return;
  }

  // Command handling (starts with /)
  if (text.startsWith('/')) {
    await handleCommand(client, event, perm);
    return;
  }

  // Default behavior: show company selection carousel
  // This shows all companies the user has permission to access
  const accessibleCompanies = Object.entries(perm.companies)
    .filter(([, hasAccess]) => hasAccess)
    .map(([name]) => name);

  if (accessibleCompanies.length === 0) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'คุณยังไม่มีสิทธิ์เข้าถึงบริษัทใด กรุณาติดต่อผู้ดูแลระบบ',
    });
    return;
  }

  // Load company data for carousel
  const companies = await Promise.all(
    accessibleCompanies.map(name => parseCompanySheet(name).catch(() => null))
  );
  const validCompanies = companies.filter(Boolean) as Awaited<ReturnType<typeof parseCompanySheet>>[];

  const carousel = buildCompanySelectionCarousel(validCompanies);
  await client.replyMessage(event.replyToken, carousel);
}
