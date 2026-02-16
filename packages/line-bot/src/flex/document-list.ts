import { FlexMessage, FlexBubble } from '@line/bot-sdk';
import { Company, getDocumentExpiryStatus } from '@company-bot/shared';
import { config } from '../config';

interface DocListOptions {
  canDownloadDocuments?: boolean;
}

export function buildDocumentList(company: Company, options: DocListOptions = {}): FlexMessage {
  const { canDownloadDocuments = false } = options;
  const docs = company.documents;

  if (docs.length === 0) {
    const bubble: FlexBubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `เอกสาร — ${company.companyNameTh}`, weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: 'ไม่พบเอกสาร', size: 'sm', color: '#999999', margin: 'md' },
        ],
      },
    };
    return { type: 'flex', altText: 'ไม่พบเอกสาร', contents: bubble };
  }

  const docItems: any[] = docs.slice(0, 10).flatMap((doc, i) => {
    const expiryStatus = getDocumentExpiryStatus(doc.expiryDate);
    const items: any[] = [];

    if (i > 0) {
      items.push({ type: 'separator', margin: 'lg' });
    }

    // Document name
    const cardContents: any[] = [
      {
        type: 'text',
        text: doc.name,
        size: 'md',
        color: '#111111',
        weight: 'bold',
        wrap: true,
      },
    ];

    // Meta info line (date or type)
    if (doc.updatedDate) {
      cardContents.push({
        type: 'text',
        text: `อัปเดต ${doc.updatedDate}`,
        size: 'xs',
        color: '#8C8C8C',
        margin: 'sm',
      });
    } else if (doc.type) {
      cardContents.push({
        type: 'text',
        text: doc.type,
        size: 'xs',
        color: '#8C8C8C',
        margin: 'sm',
      });
    }

    // Expiry badge
    if (doc.expiryDate) {
      const statusLabel = expiryStatus === 'expired' ? 'หมดอายุแล้ว'
        : expiryStatus === 'expiring-7d' ? 'ใกล้หมดอายุ'
        : expiryStatus === 'expiring-30d' ? 'หมดอายุใน 30 วัน'
        : null;
      const badgeBg = expiryStatus === 'expired' ? '#FDEDED'
        : expiryStatus === 'expiring-7d' ? '#FFF3E0'
        : expiryStatus === 'expiring-30d' ? '#FFFDE7'
        : '#F5F5F5';
      const badgeColor = expiryStatus === 'expired' ? '#D32F2F'
        : expiryStatus === 'expiring-7d' ? '#E65100'
        : expiryStatus === 'expiring-30d' ? '#F57F17'
        : '#999999';

      cardContents.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: statusLabel ? `${doc.expiryDate} · ${statusLabel}` : doc.expiryDate,
            size: 'xxs',
            color: badgeColor,
            flex: 0,
          },
        ],
        backgroundColor: badgeBg,
        cornerRadius: 'md',
        paddingAll: '4px',
        paddingStart: '8px',
        paddingEnd: '8px',
        margin: 'sm',
      });
    }

    // Action buttons row
    const hasDriveFile = doc.driveFileId && !doc.driveFileId.startsWith('http');
    const actionButtons: any[] = [];

    const liffBase = `https://liff.line.me/${config.liffId}`;
    if (hasDriveFile) {
      const encodedName = encodeURIComponent(doc.name);
      const encodedFileId = encodeURIComponent(doc.driveFileId!);
      actionButtons.push({
        type: 'button',
        action: { type: 'uri', label: 'ดู PDF', uri: `${liffBase}/doc-viewer.html?fileId=${encodedFileId}&name=${encodedName}` },
        style: 'primary',
        color: '#0D99FF',
        height: 'sm',
        flex: 1,
      });
      if (canDownloadDocuments) {
        actionButtons.push({
          type: 'button',
          action: { type: 'uri', label: 'บันทึก', uri: `${liffBase}/doc-viewer.html?fileId=${encodedFileId}&name=${encodedName}&mode=download` },
          style: 'secondary',
          height: 'sm',
          flex: 1,
        });
      }
    } else if (doc.driveUrl) {
      actionButtons.push({
        type: 'button',
        action: { type: 'uri', label: 'เปิดลิงก์', uri: doc.driveUrl },
        style: 'primary',
        color: '#0D99FF',
        height: 'sm',
        flex: 1,
      });
    }

    if (actionButtons.length > 0) {
      cardContents.push({
        type: 'box',
        layout: 'horizontal',
        contents: actionButtons,
        spacing: 'sm',
        margin: 'md',
      });
    }

    items.push({
      type: 'box',
      layout: 'vertical',
      contents: cardContents,
      margin: i === 0 ? 'none' : 'lg',
      paddingAll: '2px',
    });

    return items;
  });

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'เอกสาร',
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF',
              flex: 1,
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `${docs.length}`,
                  size: 'sm',
                  color: '#0D99FF',
                  align: 'center',
                  weight: 'bold',
                },
              ],
              backgroundColor: '#FFFFFF',
              cornerRadius: 'xxl',
              width: '28px',
              height: '28px',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 0,
            },
          ],
          alignItems: 'center',
        },
        {
          type: 'text',
          text: company.companyNameTh,
          size: 'xs',
          color: '#FFFFFFCC',
          wrap: true,
          margin: 'sm',
        },
      ],
      backgroundColor: '#0D99FF',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: docItems,
      paddingAll: '16px',
      spacing: 'none',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'กลับ',
            data: `action=detail&company=${encodeURIComponent(company.sheetName)}`,
          },
          style: 'secondary',
          height: 'sm',
        },
      ],
      paddingAll: '16px',
    },
  };

  return {
    type: 'flex',
    altText: `เอกสารบริษัท ${company.companyNameTh}`,
    contents: bubble,
  };
}
