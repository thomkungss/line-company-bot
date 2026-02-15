import { FlexMessage, FlexBubble } from '@line/bot-sdk';
import { VersionEntry, truncate } from '@company-bot/shared';

export function buildVersionDiff(companyName: string, versions: VersionEntry[]): FlexMessage {
  if (versions.length === 0) {
    const bubble: FlexBubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `ประวัติ — ${companyName}`, weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: 'ไม่พบประวัติการเปลี่ยนแปลง', size: 'sm', color: '#999999', margin: 'md' },
        ],
      },
    };
    return { type: 'flex', altText: 'ไม่พบประวัติ', contents: bubble };
  }

  const items: any[] = versions.slice(0, 8).map((v, i) => ({
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: v.fieldChanged, size: 'sm', color: '#1DB446', weight: 'bold', flex: 3 },
          { type: 'text', text: v.timestamp.split('T')[0] || v.timestamp.slice(0, 10), size: 'xxs', color: '#999999', flex: 2, align: 'end' },
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'เดิม:', size: 'xxs', color: '#FF6B6B', flex: 1 },
          { type: 'text', text: truncate(v.oldValue || '-', 60), size: 'xxs', color: '#555555', flex: 5, wrap: true },
        ],
        margin: 'sm',
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'ใหม่:', size: 'xxs', color: '#27AE60', flex: 1 },
          { type: 'text', text: truncate(v.newValue || '-', 60), size: 'xxs', color: '#555555', flex: 5, wrap: true },
        ],
        margin: 'xs',
      },
      {
        type: 'text',
        text: `โดย: ${v.changedBy || '-'}`,
        size: 'xxs',
        color: '#AAAAAA',
        margin: 'xs',
      },
    ],
    margin: i === 0 ? 'none' : 'lg',
    ...(i < versions.length - 1 ? {} : {}),
  }));

  // Add separators between items
  const withSeparators: any[] = [];
  items.forEach((item, i) => {
    withSeparators.push(item);
    if (i < items.length - 1) {
      withSeparators.push({ type: 'separator', margin: 'md' });
    }
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
          text: `ประวัติเปลี่ยนแปลง — ${companyName}`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
          wrap: true,
        },
        {
          type: 'text',
          text: `${versions.length} รายการล่าสุด`,
          size: 'xs',
          color: '#FFFFFFCC',
        },
      ],
      backgroundColor: '#F39C12',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: withSeparators,
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
            data: `action=detail&company=${encodeURIComponent(companyName)}`,
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
    altText: `ประวัติเปลี่ยนแปลง ${companyName}`,
    contents: bubble,
  };
}
