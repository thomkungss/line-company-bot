import { Client, PostbackEvent } from '@line/bot-sdk';
import { getUserPermission, parseCompanySheet, getVersionHistory } from '@company-bot/shared';
import { buildCompanyDetailFlex } from '../flex/company-card';
import { buildDocumentList } from '../flex/document-list';
import { buildVersionDiff } from '../flex/version-diff';
import { buildShareholderTable } from '../flex/shareholder-table';
import { config } from '../config';

interface PostbackData {
  action: string;
  company?: string;
  fileId?: string;
}

function parsePostbackData(data: string): PostbackData {
  const params = new URLSearchParams(data);
  return {
    action: params.get('action') || '',
    company: params.get('company') || undefined,
    fileId: params.get('fileId') || undefined,
  };
}

export async function handlePostback(client: Client, event: PostbackEvent): Promise<void> {
  const userId = event.source.userId;
  if (!userId) return;

  const perm = await getUserPermission(userId);
  if (!perm) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาติดต่อผู้ดูแลระบบ',
    });
    return;
  }

  const pb = parsePostbackData(event.postback.data);

  if (pb.company && !perm.companies[pb.company]) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `คุณไม่มีสิทธิ์เข้าถึงข้อมูลบริษัท "${pb.company}"`,
    });
    return;
  }

  switch (pb.action) {
    case 'detail': {
      if (!pb.company) return;
      const company = await parseCompanySheet(pb.company);
      const flex = buildCompanyDetailFlex(company);
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case 'shareholders': {
      if (!pb.company) return;
      const company = await parseCompanySheet(pb.company);
      const flex = buildShareholderTable(company);
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case 'documents': {
      if (!pb.company) return;
      const company = await parseCompanySheet(pb.company);
      const flex = buildDocumentList(company);
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case 'history': {
      if (!pb.company) return;
      const versions = await getVersionHistory(pb.company);
      const flex = buildVersionDiff(pb.company, versions.slice(0, 10));
      await client.replyMessage(event.replyToken, flex);
      break;
    }

    case 'liff_detail': {
      if (!pb.company) return;
      const liffUrl = `https://liff.line.me/${config.liffId}/company-detail.html?company=${encodeURIComponent(pb.company)}`;
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `เปิดรายละเอียด: ${liffUrl}`,
      });
      break;
    }

    case 'download': {
      if (!pb.fileId) return;
      const downloadUrl = `${config.baseUrl}/api/download/${pb.fileId}`;
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `ดาวน์โหลดเอกสาร: ${downloadUrl}`,
      });
      break;
    }

    default:
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ไม่รู้จัก action นี้',
      });
  }
}
