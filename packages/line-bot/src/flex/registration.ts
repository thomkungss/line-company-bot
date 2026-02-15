import { FlexMessage, FlexBubble } from '@line/bot-sdk';

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
