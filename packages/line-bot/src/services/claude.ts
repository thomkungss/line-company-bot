import Anthropic from '@anthropic-ai/sdk';
import {
  getChatHistory, appendChatLog, parseCompanySheet,
  getAccessibleCompanies, thaiNow, ChatLogEntry
} from '@company-bot/shared';
import { config } from '../config';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `คุณคือ "เลขาบริษัท AI" ผู้ช่วยอัจฉริยะที่ช่วยตอบคำถามเกี่ยวกับข้อมูลบริษัท

หน้าที่ของคุณ:
- ตอบคำถามเกี่ยวกับข้อมูลบริษัทที่ได้รับ (กรรมการ, ผู้ถือหุ้น, ทุนจดทะเบียน, เอกสาร ฯลฯ)
- แนะนำคำสั่ง /command ที่เหมาะสมให้ผู้ใช้
- ตอบเป็นภาษาไทย สุภาพ กระชับ
- ถ้าไม่มีข้อมูลที่ถาม ให้บอกตรงๆ ว่าไม่มีข้อมูล
- ห้ามสร้างข้อมูลขึ้นมาเอง

คำสั่งที่แนะนำได้:
- /list — ดูรายชื่อบริษัท
- /company <ชื่อ> — ดูข้อมูลบริษัท
- /shareholders <ชื่อ> — ดูผู้ถือหุ้น
- /docs <ชื่อ> — ดูเอกสาร
- /history <ชื่อ> — ดูประวัติเปลี่ยนแปลง`;

export async function handleAIChat(
  userId: string,
  userMessage: string,
  accessibleCompanyNames: string[]
): Promise<string> {
  try {
    const anthropic = getClient();

    // Load accessible company data as context
    const companiesData = await Promise.all(
      accessibleCompanyNames.slice(0, 5).map(async (name) => {
        try {
          const company = await parseCompanySheet(name);
          return `--- บริษัท: ${company.companyNameTh} (${company.companyNameEn}) ---
เลขทะเบียน: ${company.registrationNumber}
กรรมการ: ${company.directors.map(d => d.name).join(', ')}
อำนาจกรรมการ: ${company.authorizedSignatory}
ทุนจดทะเบียน: ${company.capitalText || company.registeredCapital}
ผู้ถือหุ้น: ${company.shareholders.map(s => `${s.name} (${s.shares} หุ้น)`).join(', ')}
ที่อยู่: ${company.headOfficeAddress}
เอกสาร: ${company.documents.map(d => d.name).join(', ')}`;
        } catch {
          return `--- บริษัท: ${name} --- (ไม่สามารถโหลดข้อมูลได้)`;
        }
      })
    );

    // Load chat history
    const history = await getChatHistory(userId, 10);
    const messages = history.map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.message,
    }));
    messages.push({ role: 'user', content: userMessage });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `${SYSTEM_PROMPT}\n\nข้อมูลบริษัทที่ผู้ใช้มีสิทธิ์เข้าถึง:\n${companiesData.join('\n\n')}`,
      messages,
    });

    const assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('');

    // Log conversation
    const now = thaiNow();
    const companyContext = accessibleCompanyNames.join(',');
    await appendChatLog({ timestamp: now, userId, role: 'user', message: userMessage, companyContext });
    await appendChatLog({ timestamp: now, userId, role: 'assistant', message: assistantMessage, companyContext });

    return assistantMessage;
  } catch (err: any) {
    console.error('Claude AI error:', err.message);
    return 'ขออภัย ไม่สามารถประมวลผลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
  }
}
