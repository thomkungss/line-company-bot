import { FlexMessage, FlexBubble } from '@line/bot-sdk';
import { Company, formatNumber } from '@company-bot/shared';

export function buildShareholderTable(company: Company): FlexMessage {
  const rows: any[] = company.shareholders.map((sh, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${sh.order}.`, size: 'xs', color: '#555555', flex: 1 },
      { type: 'text', text: sh.name, size: 'xs', color: '#333333', flex: 5, wrap: true },
      { type: 'text', text: formatNumber(sh.shares), size: 'xs', color: '#333333', flex: 3, align: 'end' },
      { type: 'text', text: sh.percentage ? `${sh.percentage}%` : '-', size: 'xs', color: '#999999', flex: 2, align: 'end' },
    ],
    margin: i === 0 ? 'none' : 'sm',
    ...(i % 2 === 0 ? { backgroundColor: '#F8F8F8' } : {}),
    paddingAll: '5px',
  }));

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `ผู้ถือหุ้น — ${company.companyNameTh}`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
          wrap: true,
        },
        {
          type: 'text',
          text: `ทั้งหมด ${company.shareholders.length} คน`,
          size: 'xs',
          color: '#FFFFFFCC',
        },
      ],
      backgroundColor: '#27AE60',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        // Table header
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '#', size: 'xxs', color: '#999999', flex: 1, weight: 'bold' },
            { type: 'text', text: 'ชื่อ', size: 'xxs', color: '#999999', flex: 5, weight: 'bold' },
            { type: 'text', text: 'หุ้น', size: 'xxs', color: '#999999', flex: 3, align: 'end', weight: 'bold' },
            { type: 'text', text: '%', size: 'xxs', color: '#999999', flex: 2, align: 'end', weight: 'bold' },
          ],
          paddingAll: '5px',
        },
        { type: 'separator', margin: 'sm' },
        // Rows (max 15 to fit)
        ...rows.slice(0, 15),
        ...(company.shareholders.length > 15 ? [{
          type: 'text' as const,
          text: `... และอีก ${company.shareholders.length - 15} คน`,
          size: 'xs' as const,
          color: '#999999',
          margin: 'md' as const,
          align: 'center' as const,
        }] : []),
      ],
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
    altText: `ผู้ถือหุ้น ${company.companyNameTh}`,
    contents: bubble,
  };
}
