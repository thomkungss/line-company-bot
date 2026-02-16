import { FlexMessage, FlexBubble, FlexComponent } from '@line/bot-sdk';
import { UserPermission } from '@company-bot/shared';

/** Flex message prompting unregistered user to register via LIFF */
export function buildRegistrationPrompt(liffId: string): FlexMessage {
  const registerUrl = `https://liff.line.me/${liffId}/register.html`;

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'ยังไม่ได้สมัครใช้งาน',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      backgroundColor: '#FF6B6B',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'คุณยังไม่มีสิทธิ์เข้าถึงข้อมูล',
          size: 'md',
          color: '#333333',
          wrap: true,
        },
        {
          type: 'text',
          text: 'กดปุ่มด้านล่างเพื่อสมัครใช้งาน หลังสมัครแล้วจะต้องรอผู้ดูแลระบบอนุมัติก่อนถึงจะใช้งานได้',
          size: 'sm',
          color: '#999999',
          wrap: true,
          margin: 'md',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'สมัครใช้งาน',
            uri: registerUrl,
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm',
        },
      ],
      paddingAll: '15px',
    },
  };

  return {
    type: 'flex',
    altText: 'คุณยังไม่ได้สมัครใช้งาน กดเพื่อสมัคร',
    contents: bubble,
  };
}

/** Flex message shown to users waiting for admin approval */
export function buildPendingApproval(): FlexMessage {
  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'รอการอนุมัติ',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      backgroundColor: '#F39C12',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'คุณได้สมัครใช้งานแล้ว',
          size: 'md',
          color: '#333333',
          wrap: true,
        },
        {
          type: 'text',
          text: 'กรุณารอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะแจ้งเตือนให้ทราบ',
          size: 'sm',
          color: '#999999',
          wrap: true,
          margin: 'md',
        },
      ],
      paddingAll: '20px',
    },
  };

  return {
    type: 'flex',
    altText: 'การสมัครของคุณอยู่ระหว่างรอการอนุมัติ',
    contents: bubble,
  };
}

/** Flex message prompting approved user (no companies) to choose companies via LIFF */
export function buildNoCompanyAccess(liffId: string): FlexMessage {
  const requestUrl = `https://liff.line.me/${liffId}/request-access.html`;

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'ยังไม่มีสิทธิ์เข้าถึงบริษัท',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      backgroundColor: '#FF6B6B',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'คุณยังไม่มีสิทธิ์เข้าถึงบริษัทใด',
          size: 'md',
          color: '#333333',
          wrap: true,
        },
        {
          type: 'text',
          text: 'กดปุ่มด้านล่างเพื่อเลือกบริษัทที่ต้องการเข้าถึง แล้วรอผู้ดูแลระบบอนุมัติ',
          size: 'sm',
          color: '#999999',
          wrap: true,
          margin: 'md',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'เลือกบริษัท',
            uri: requestUrl,
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm',
        },
      ],
      paddingAll: '15px',
    },
  };

  return {
    type: 'flex',
    altText: 'คุณยังไม่มีสิทธิ์เข้าถึงบริษัทใด กดเพื่อเลือกบริษัท',
    contents: bubble,
  };
}

/** Flex message shown to users waiting for company access approval */
export function buildPendingCompanyAccess(): FlexMessage {
  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'รอการอนุมัติสิทธิ์บริษัท',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      backgroundColor: '#F39C12',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'คุณได้ขอสิทธิ์เข้าถึงบริษัทแล้ว',
          size: 'md',
          color: '#333333',
          wrap: true,
        },
        {
          type: 'text',
          text: 'กรุณารอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะแจ้งเตือนให้ทราบ',
          size: 'sm',
          color: '#999999',
          wrap: true,
          margin: 'md',
        },
      ],
      paddingAll: '20px',
    },
  };

  return {
    type: 'flex',
    altText: 'รอการอนุมัติสิทธิ์เข้าถึงบริษัท',
    contents: bubble,
  };
}

/** Flex message sent to super_admin when a user requests company access */
export function buildCompanyAccessApproval(
  userId: string,
  displayName: string,
  companies: string[],
  pictureUrl?: string,
): FlexMessage {
  const companiesList = companies.join(', ');

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'ขอสิทธิ์เข้าถึงบริษัท',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      backgroundColor: '#17A2B8',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        ...(pictureUrl
          ? [
              {
                type: 'box' as const,
                layout: 'vertical' as const,
                contents: [
                  {
                    type: 'image' as const,
                    url: pictureUrl,
                    size: 'lg' as const,
                    aspectRatio: '1:1' as const,
                    aspectMode: 'cover' as const,
                  },
                ],
                width: '80px',
                height: '80px',
                cornerRadius: '40px',
                offsetStart: 'none' as const,
              },
              { type: 'separator' as const, margin: 'md' as const },
            ]
          : []),
        {
          type: 'text',
          text: displayName,
          weight: 'bold',
          size: 'xl',
          color: '#333333',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'User ID', size: 'xs', color: '#999999', flex: 3 },
            { type: 'text', text: userId, size: 'xs', color: '#333333', flex: 7, wrap: true },
          ],
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'บริษัทที่ขอ', size: 'xs', color: '#999999', flex: 3 },
            { type: 'text', text: companiesList, size: 'xs', color: '#333333', flex: 7, wrap: true },
          ],
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'อนุมัติ',
            data: `action=approve_access&userId=${encodeURIComponent(userId)}`,
            displayText: `อนุมัติสิทธิ์บริษัทให้ ${displayName}`,
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ปฏิเสธ',
            data: `action=reject_access&userId=${encodeURIComponent(userId)}`,
            displayText: `ปฏิเสธสิทธิ์บริษัทของ ${displayName}`,
          },
          style: 'primary',
          color: '#E74C3C',
          height: 'sm',
          flex: 1,
        },
      ],
      paddingAll: '15px',
      spacing: 'sm',
    },
  };

  return {
    type: 'flex',
    altText: `${displayName} ขอสิทธิ์เข้าถึงบริษัท: ${companiesList}`,
    contents: bubble,
  };
}

/** Flex message sent to super_admin when a new user registers */
export function buildApprovalRequest(
  userId: string,
  displayName: string,
  pictureUrl?: string,
): FlexMessage {
  const heroContents: any[] = [];
  if (pictureUrl) {
    heroContents.push({
      type: 'image',
      url: pictureUrl,
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
    });
  }

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'มีผู้สมัครใหม่',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      backgroundColor: '#17A2B8',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        ...(pictureUrl
          ? [
              {
                type: 'box' as const,
                layout: 'vertical' as const,
                contents: [
                  {
                    type: 'image' as const,
                    url: pictureUrl,
                    size: 'lg' as const,
                    aspectRatio: '1:1' as const,
                    aspectMode: 'cover' as const,
                  },
                ],
                width: '80px',
                height: '80px',
                cornerRadius: '40px',
                offsetStart: 'none' as const,
              },
              { type: 'separator' as const, margin: 'md' as const },
            ]
          : []),
        {
          type: 'text',
          text: displayName,
          weight: 'bold',
          size: 'xl',
          color: '#333333',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'User ID', size: 'xs', color: '#999999', flex: 3 },
            { type: 'text', text: userId, size: 'xs', color: '#333333', flex: 7, wrap: true },
          ],
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'สิทธิ์ที่ขอ', size: 'xs', color: '#999999', flex: 3 },
            { type: 'text', text: 'viewer', size: 'xs', color: '#333333', flex: 7 },
          ],
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'อนุมัติ',
            data: `action=approve_user&userId=${encodeURIComponent(userId)}`,
            displayText: `อนุมัติผู้ใช้ ${displayName}`,
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'ปฏิเสธ',
            data: `action=reject_user&userId=${encodeURIComponent(userId)}`,
            displayText: `ปฏิเสธผู้ใช้ ${displayName}`,
          },
          style: 'primary',
          color: '#E74C3C',
          height: 'sm',
          flex: 1,
        },
      ],
      paddingAll: '15px',
      spacing: 'sm',
    },
  };

  return {
    type: 'flex',
    altText: `มีผู้สมัครใหม่: ${displayName}`,
    contents: bubble,
  };
}

/** Flex message showing user's permission summary */
export function buildPermissionSummary(perm: UserPermission): FlexMessage {
  const accessibleCompanies = Object.entries(perm.companies)
    .filter(([, v]) => v)
    .map(([name]) => name);

  const roleLabel: Record<string, string> = {
    super_admin: 'ผู้ดูแลระบบ',
    admin: 'แอดมิน',
    viewer: 'ผู้ใช้ทั่วไป',
  };

  // Company list with document buttons
  const companyRows: FlexComponent[] = accessibleCompanies.map(name => ({
    type: 'box' as const,
    layout: 'horizontal' as const,
    contents: [
      { type: 'text' as const, text: name, size: 'sm' as const, color: '#333333', flex: 5, wrap: true, gravity: 'center' as const },
      {
        type: 'button' as const,
        action: {
          type: 'postback' as const,
          label: 'ดูข้อมูล',
          data: `action=detail&company=${encodeURIComponent(name)}`,
        },
        style: 'primary' as const,
        color: '#17A2B8',
        height: 'sm' as const,
        flex: 3,
      },
    ],
    spacing: 'sm' as const,
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
          text: `สวัสดี, ${perm.displayName}`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: roleLabel[perm.role] || perm.role,
          size: 'xs',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      backgroundColor: '#1DB446',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        // บริษัทที่เข้าถึงได้
        {
          type: 'text',
          text: `บริษัทที่เข้าถึงได้ (${accessibleCompanies.length})`,
          size: 'sm',
          color: '#1DB446',
          weight: 'bold',
          margin: 'lg',
        },
        ...(companyRows.length > 0 ? companyRows : [{
          type: 'text' as const,
          text: 'ไม่มี',
          size: 'sm' as const,
          color: '#999999',
          margin: 'sm' as const,
        }]),
      ],
      paddingAll: '20px',
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
            label: 'ดูข้อมูลบริษัททั้งหมด',
            data: 'action=list_all',
          },
          style: 'primary',
          color: '#1DB446',
          height: 'sm',
        },
      ],
      paddingAll: '15px',
    },
  };

  return {
    type: 'flex',
    altText: `สิทธิ์ของคุณ: เข้าถึง ${accessibleCompanies.length} บริษัท`,
    contents: bubble,
  };
}
