import { FlexMessage, FlexBubble } from '@line/bot-sdk';
import { Company } from '@company-bot/shared';
import { config } from '../config';

export function buildDocumentList(company: Company): FlexMessage {
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
    const infoContents: any[] = [
      { type: 'text', text: doc.name, size: 'sm', color: '#333333', wrap: true },
    ];
    if (doc.updatedDate) {
      infoContents.push({ type: 'text', text: `อัปเดต: ${doc.updatedDate}`, size: 'xxs', color: '#17A2B8' });
    } else if (doc.type) {
      infoContents.push({ type: 'text', text: doc.type, size: 'xxs', color: '#999999' });
    }
    const items: any[] = [];
    if (i > 0) {
      items.push({ type: 'separator', margin: 'md' });
    }
    items.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          contents: infoContents,
          flex: 5,
        },
        {
          type: 'button',
          action: doc.driveFileId
            ? {
                type: 'uri',
                label: 'ดาวน์โหลด',
                uri: `${config.baseUrl}/api/download/${doc.driveFileId}`,
              }
            : doc.driveUrl
            ? { type: 'uri', label: 'เปิด', uri: doc.driveUrl }
            : { type: 'postback', label: '-', data: 'action=noop' },
          style: 'link',
          height: 'sm',
          flex: 2,
        },
      ],
      margin: i === 0 ? 'none' : 'md',
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
          type: 'text',
          text: `เอกสาร — ${company.companyNameTh}`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
          wrap: true,
        },
        {
          type: 'text',
          text: `${docs.length} รายการ`,
          size: 'xs',
          color: '#FFFFFFCC',
        },
      ],
      backgroundColor: '#17A2B8',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: docItems,
      paddingAll: '15px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
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
      paddingAll: '15px',
    },
  };

  return {
    type: 'flex',
    altText: `เอกสารบริษัท ${company.companyNameTh}`,
    contents: bubble,
  };
}
