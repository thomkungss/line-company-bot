import { FlexMessage, FlexBubble, FlexCarousel } from '@line/bot-sdk';
import { Company, formatMoney, formatNumber, truncate } from '@company-bot/shared';
import { config } from '../config';

interface CardOptions {
  canViewDocuments?: boolean;
}

/** Build a company selection carousel — shown when user types anything */
export function buildCompanySelectionCarousel(companies: Company[], opts: CardOptions = {}): FlexMessage {
  const bubbles: FlexBubble[] = companies.map(company => {
    const headerContents: any[] = [
      {
        type: 'text',
        text: company.companyNameTh || company.sheetName,
        weight: 'bold',
        size: 'md',
        color: '#1DB446',
        wrap: true,
      },
    ];
    if (company.companyNameEn) {
      headerContents.push({
        type: 'text',
        text: company.companyNameEn,
        size: 'xs',
        color: '#aaaaaa',
        wrap: true,
      });
    }
    return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: headerContents,
      paddingAll: '15px',
      backgroundColor: '#F7F7F7',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        // เลขทะเบียน
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'เลขทะเบียนนิติบุคคล', size: 'xs', color: '#999999', flex: 4 },
            { type: 'text', text: company.registrationNumber || '-', size: 'xs', color: '#333333', flex: 5, align: 'end' },
          ],
        },
        { type: 'separator', margin: 'sm' },
        // ทุนจดทะเบียน
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'ทุนจดทะเบียน', size: 'xs', color: '#999999', flex: 3 },
            { type: 'text', text: company.registeredCapital ? formatMoney(company.registeredCapital) : '-', size: 'xs', color: '#333333', flex: 5, align: 'end' },
          ],
          margin: 'sm',
        },
        { type: 'separator', margin: 'sm' },
        // กรรมการ — แสดงชื่อ
        {
          type: 'text',
          text: `กรรมการ (${company.directors.length} คน)`,
          size: 'xs',
          color: '#1DB446',
          weight: 'bold',
          margin: 'sm',
        },
        ...company.directors.slice(0, 5).map(d => ({
          type: 'text' as const,
          text: `• ${d.name}${d.position ? ` (${d.position})` : ''}`,
          size: 'xxs' as const,
          color: '#555555',
          wrap: true,
        })),
        ...(company.directors.length > 5 ? [{
          type: 'text' as const,
          text: `...และอีก ${company.directors.length - 5} คน`,
          size: 'xxs' as const,
          color: '#999999',
        }] : []),
        { type: 'separator', margin: 'sm' },
        // ผู้ถือหุ้น — แสดงชื่อ + %
        {
          type: 'text',
          text: `ผู้ถือหุ้น (${company.shareholders.length} คน)`,
          size: 'xs',
          color: '#1DB446',
          weight: 'bold',
          margin: 'sm',
        },
        ...company.shareholders.slice(0, 5).flatMap(s => {
          const detail = [
            s.percentage ? `${s.percentage}%` : '',
            s.shares > 0 ? `${formatNumber(s.shares)} หุ้น` : '',
          ].filter(Boolean).join(' | ');
          return [{
            type: 'box' as const,
            layout: 'vertical' as const,
            contents: [
              { type: 'text' as const, text: `• ${s.name}`, size: 'xxs' as const, color: '#555555', wrap: true },
              ...(detail ? [{ type: 'text' as const, text: `  ${detail}`, size: 'xxs' as const, color: '#17A2B8' }] : []),
            ],
          }];
        }),
        ...(company.shareholders.length > 5 ? [{
          type: 'text' as const,
          text: `...และอีก ${company.shareholders.length - 5} คน`,
          size: 'xxs' as const,
          color: '#999999',
        }] : []),
        { type: 'separator', margin: 'sm' },
        // ที่ตั้งสำนักงาน
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'ที่ตั้งสำนักงานใหญ่', size: 'xs', color: '#999999' },
            { type: 'text', text: truncate(company.headOfficeAddress || '-', 100), size: 'xs', color: '#333333', wrap: true, margin: 'xs' },
          ],
          margin: 'sm',
        },
      ],
      paddingAll: '15px',
      spacing: 'sm',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ดูข้อมูลบริษัท',
            data: `action=detail&company=${encodeURIComponent(company.sheetName)}`,
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            ...(opts.canViewDocuments !== false ? [{
              type: 'button' as const,
              action: {
                type: 'postback' as const,
                label: 'เอกสาร',
                data: `action=documents&company=${encodeURIComponent(company.sheetName)}`,
              },
              style: 'secondary' as const,
              height: 'sm' as const,
              flex: 1,
            }] : []),
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'ผู้ถือหุ้น',
                data: `action=shareholders&company=${encodeURIComponent(company.sheetName)}`,
              },
              style: 'secondary',
              height: 'sm',
              flex: 1,
            },
          ],
          spacing: 'sm',
          margin: 'sm',
        },
      ],
      paddingAll: '15px',
      spacing: 'sm',
    },
  };
  });

  return {
    type: 'flex',
    altText: 'เลือกบริษัทที่ต้องการ',
    contents: {
      type: 'carousel',
      contents: bubbles.slice(0, 12), // LINE limit 12 bubbles
    },
  };
}

/** Build detailed company Flex Message */
export function buildCompanyDetailFlex(company: Company, opts: CardOptions = {}): FlexMessage {
  const sealUrl = company.sealImageDriveId
    ? `${config.baseUrl}/api/seal/${company.sealImageDriveId}`
    : undefined;

  const bodyContents: any[] = [
    // Registration number
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'เลขทะเบียน', size: 'sm', color: '#999999', flex: 4 },
        { type: 'text', text: company.registrationNumber || '-', size: 'sm', color: '#333333', flex: 6, wrap: true },
      ],
    },
    { type: 'separator', margin: 'md' },
    // Directors
    {
      type: 'text',
      text: `กรรมการ (${company.directors.length} คน)`,
      size: 'sm',
      color: '#1DB446',
      weight: 'bold',
      margin: 'md',
    },
    ...company.directors.slice(0, 5).map(d => ({
      type: 'text' as const,
      text: `• ${d.name}${d.position ? ` (${d.position})` : ''}`,
      size: 'xs',
      color: '#555555',
      wrap: true,
      margin: 'sm',
    })),
  ];

  if (company.directors.length > 5) {
    bodyContents.push({
      type: 'text',
      text: `... และอีก ${company.directors.length - 5} คน`,
      size: 'xs',
      color: '#999999',
      margin: 'sm',
    });
  }

  bodyContents.push(
    { type: 'separator', margin: 'md' },
    // Capital
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'ทุนจดทะเบียน', size: 'sm', color: '#999999', flex: 4 },
        { type: 'text', text: company.registeredCapital ? formatMoney(company.registeredCapital) : '-', size: 'sm', color: '#333333', flex: 6, wrap: true },
      ],
      margin: 'md',
    },
    // Shareholders count
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'ผู้ถือหุ้น', size: 'sm', color: '#999999', flex: 4 },
        { type: 'text', text: company.shareholders.length > 0 ? `${company.shareholders.length} คน` : '-', size: 'sm', color: '#333333', flex: 6 },
      ],
      margin: 'sm',
    },
    // Shareholder list
    ...company.shareholders.slice(0, 5).map(s => ({
      type: 'box' as const,
      layout: 'horizontal' as const,
      contents: [
        { type: 'text' as const, text: `${s.order}. ${s.name}`, size: 'xs' as const, color: '#333333', flex: 6, wrap: true },
        { type: 'text' as const, text: s.percentage ? `${s.percentage}%` : '-', size: 'xs' as const, color: '#333333', flex: 2, align: 'end' as const },
      ],
      margin: 'sm' as const,
    })),
    ...(company.shareholders.length > 5 ? [{
      type: 'text' as const,
      text: `...และอีก ${company.shareholders.length - 5} คน`,
      size: 'xs' as const,
      color: '#999999',
      margin: 'sm' as const,
    }] : []),
    { type: 'separator', margin: 'md' },
    // Address
    {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'ที่ตั้งสำนักงานใหญ่', size: 'sm', color: '#999999' },
        { type: 'text', text: truncate(company.headOfficeAddress || '-', 120), size: 'xs', color: '#333333', wrap: true, margin: 'sm' },
      ],
      margin: 'md',
    },
  );

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: company.companyNameTh || company.sheetName,
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF',
          wrap: true,
        },
        ...(company.companyNameEn ? [{
          type: 'text' as const,
          text: company.companyNameEn,
          size: 'sm' as const,
          color: '#FFFFFFCC',
          wrap: true,
        }] : []),
        ...(company.dataDate ? [{
          type: 'text' as const,
          text: company.dataDate,
          size: 'xxs' as const,
          color: '#FFFFFF99',
          margin: 'sm' as const,
        }] : []),
      ],
      backgroundColor: '#1DB446',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        ...(opts.canViewDocuments !== false ? [{
          type: 'button' as const,
          action: {
            type: 'postback' as const,
            label: 'เอกสาร',
            data: `action=documents&company=${encodeURIComponent(company.sheetName)}`,
          },
          style: 'primary' as const,
          color: '#17A2B8',
          height: 'sm' as const,
          flex: 1,
        }] : []),
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'ดูเพิ่มเติม',
            uri: `https://liff.line.me/${config.liffId}/company-detail.html?company=${encodeURIComponent(company.sheetName)}`,
          },
          style: 'secondary',
          height: 'sm',
          flex: 1,
        },
      ],
      paddingAll: '15px',
      spacing: 'sm',
    },
  };

  // Add seal image if available
  if (sealUrl) {
    bubble.hero = {
      type: 'image',
      url: sealUrl,
      size: 'full',
      aspectRatio: '2:1',
      aspectMode: 'fit',
      backgroundColor: '#FFFFFF',
    };
  }

  return {
    type: 'flex',
    altText: `ข้อมูลบริษัท ${company.companyNameTh}`,
    contents: bubble,
  };
}
