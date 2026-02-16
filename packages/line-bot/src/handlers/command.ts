import { Client, MessageEvent, FlexMessage } from '@line/bot-sdk';
import { UserPermission, parseCompanySheet, getAccessibleCompanies, getVersionHistory } from '@company-bot/shared';
import { buildCompanyDetailFlex } from '../flex/company-card';
import { buildShareholderTable } from '../flex/shareholder-table';

import { buildVersionDiff } from '../flex/version-diff';
import { buildCompanySelectionCarousel } from '../flex/company-card';

export async function handleCommand(
  client: Client,
  event: MessageEvent,
  perm: UserPermission
): Promise<void> {
  if (event.message.type !== 'text') return;

  const text = event.message.text.trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/company': {
      if (!arg) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'กรุณาระบุชื่อบริษัท เช่น /company มูทูเดย์',
        });
        return;
      }
      if (!perm.companies[arg]) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `คุณไม่มีสิทธิ์เข้าถึงข้อมูลบริษัท "${arg}"`,
        });
        return;
      }
      const company = await parseCompanySheet(arg);
      const flex = buildCompanyDetailFlex(company, { canViewDocuments: perm.canViewDocuments });
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case '/history': {
      if (!arg) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'กรุณาระบุชื่อบริษัท เช่น /history มูทูเดย์',
        });
        return;
      }
      if (!perm.companies[arg]) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `คุณไม่มีสิทธิ์เข้าถึงประวัติบริษัท "${arg}"`,
        });
        return;
      }
      const versions = await getVersionHistory(arg);
      const flex = buildVersionDiff(arg, versions.slice(0, 10));
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case '/shareholders': {
      if (!arg || !perm.companies[arg]) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: !arg ? 'กรุณาระบุชื่อบริษัท เช่น /shareholders มูทูเดย์' : `คุณไม่มีสิทธิ์เข้าถึงข้อมูลบริษัท "${arg}"`,
        });
        return;
      }
      const company = await parseCompanySheet(arg);
      const flex = buildShareholderTable(company);
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case '/list': {
      const accessibleNames = Object.entries(perm.companies)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const companies = await Promise.all(
        accessibleNames.map(n => parseCompanySheet(n).catch(() => null))
      );
      const valid = companies.filter(Boolean) as Awaited<ReturnType<typeof parseCompanySheet>>[];
      const carousel = buildCompanySelectionCarousel(valid, { canViewDocuments: perm.canViewDocuments });
      await client.replyMessage(event.replyToken, carousel);
      break;
    }

    case '/help': {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: [
          '📋 คำสั่งที่ใช้ได้:',
          '',
          '/list — ดูรายชื่อบริษัททั้งหมด',
          '/company <ชื่อ> — ดูข้อมูลบริษัท',
          '/shareholders <ชื่อ> — ดูรายชื่อผู้ถือหุ้น',

          '/history <ชื่อ> — ดูประวัติเปลี่ยนแปลง',
          '/help — แสดงคำสั่งนี้',
          '',
          '💡 หรือพิมพ์อะไรก็ได้เพื่อดูรายชื่อบริษัท',
        ].join('\n'),
      });
      break;
    }

    default:
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ไม่รู้จักคำสั่งนี้ พิมพ์ /help เพื่อดูคำสั่งทั้งหมด',
      });
  }
}
