import { Client, MessageEvent } from '@line/bot-sdk';
import { getUserPermission } from '@company-bot/shared';
import { handleCommand } from './command';
import { buildRegistrationPrompt, buildPendingApproval, buildNoCompanyAccess, buildPendingCompanyAccess, buildPermissionSummary } from '../flex/registration';
import { config } from '../config';

export async function handleMessage(client: Client, event: MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;

  const userId = event.source.userId;
  if (!userId) return;

  const text = event.message.text.trim();
  console.log(`Message from userId: ${userId}, text: ${text}`);

  // Check permissions
  const perm = await getUserPermission(userId);
  console.log(`Permission check for ${userId}:`, JSON.stringify(perm));
  if (!perm) {
    // User not registered — show registration prompt
    await client.replyMessage(event.replyToken, buildRegistrationPrompt(config.liffId));
    return;
  }

  // User registered but not yet approved
  if (perm.approved === false) {
    await client.replyMessage(event.replyToken, buildPendingApproval());
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
    if (perm.pendingCompanies) {
      await client.replyMessage(event.replyToken, buildPendingCompanyAccess());
    } else {
      await client.replyMessage(event.replyToken, buildNoCompanyAccess(config.liffId));
    }
    return;
  }

  // Show permission summary with company buttons
  const summary = buildPermissionSummary(perm);
  await client.replyMessage(event.replyToken, summary);
}
