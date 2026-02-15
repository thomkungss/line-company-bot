import { Client, PostbackEvent } from '@line/bot-sdk';
import { getUserPermission, getPermissions, updatePermissions, parseCompanySheet, getVersionHistory } from '@company-bot/shared';
import { buildCompanyDetailFlex } from '../flex/company-card';
import { buildDocumentList } from '../flex/document-list';
import { buildVersionDiff } from '../flex/version-diff';
import { buildShareholderTable } from '../flex/shareholder-table';
import { config } from '../config';

interface PostbackData {
  action: string;
  company?: string;
  fileId?: string;
  userId?: string;
}

function parsePostbackData(data: string): PostbackData {
  const params = new URLSearchParams(data);
  return {
    action: params.get('action') || '',
    company: params.get('company') || undefined,
    fileId: params.get('fileId') || undefined,
    userId: params.get('userId') || undefined,
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
      const flex = buildCompanyDetailFlex(company, { canViewDocuments: perm.canViewDocuments });
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
      if (!perm.canViewDocuments) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'คุณไม่มีสิทธิ์ดูเอกสาร กรุณาติดต่อผู้ดูแลระบบ',
        });
        return;
      }
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

    case 'approve_user': {
      if (!pb.userId) return;
      // Only super_admin can approve
      if (perm.role !== 'super_admin') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'เฉพาะ super_admin เท่านั้นที่สามารถอนุมัติผู้ใช้ได้',
        });
        return;
      }
      const allPerms = await getPermissions();
      const targetPerm = allPerms.find(p => p.lineUserId === pb.userId);
      if (!targetPerm) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'ไม่พบผู้ใช้นี้ในระบบ',
        });
        return;
      }
      if (targetPerm.approved) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `ผู้ใช้ ${targetPerm.displayName} ได้รับอนุมัติไปแล้ว`,
        });
        return;
      }
      // Update approved to true
      targetPerm.approved = true;
      await updatePermissions(allPerms);
      // Notify the approved user
      try {
        await client.pushMessage(pb.userId, {
          type: 'text',
          text: 'คุณได้รับอนุมัติให้ใช้งานระบบแล้ว! ส่งข้อความมาเพื่อเริ่มใช้งาน',
        });
      } catch (err) {
        console.error('Failed to push approval notification:', err);
      }
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `อนุมัติผู้ใช้ ${targetPerm.displayName} เรียบร้อยแล้ว`,
      });
      break;
    }

    case 'reject_user': {
      if (!pb.userId) return;
      // Only super_admin can reject
      if (perm.role !== 'super_admin') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'เฉพาะ super_admin เท่านั้นที่สามารถปฏิเสธผู้ใช้ได้',
        });
        return;
      }
      const allPermsForReject = await getPermissions();
      const targetIdx = allPermsForReject.findIndex(p => p.lineUserId === pb.userId);
      if (targetIdx < 0) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'ไม่พบผู้ใช้นี้ในระบบ',
        });
        return;
      }
      const rejectedUser = allPermsForReject[targetIdx];
      // Remove user from permissions
      allPermsForReject.splice(targetIdx, 1);
      await updatePermissions(allPermsForReject);
      // Notify the rejected user
      try {
        await client.pushMessage(pb.userId!, {
          type: 'text',
          text: 'การสมัครใช้งานของคุณถูกปฏิเสธ หากต้องการสมัครใหม่กรุณาส่งข้อความมา',
        });
      } catch (err) {
        console.error('Failed to push rejection notification:', err);
      }
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `ปฏิเสธผู้ใช้ ${rejectedUser.displayName} เรียบร้อยแล้ว`,
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
