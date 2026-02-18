import Anthropic from '@anthropic-ai/sdk';
import {
  getChatHistory, appendChatLog, parseCompanySheet,
  getAccessibleCompanies, thaiNow, ChatLogEntry
} from '@company-bot/shared';
import { config } from '../config';
import { fetchAndCache } from './drive';

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
- เมื่อได้รับเอกสารแนบ ให้อ่านเนื้อหาในเอกสารและตอบคำถามจากข้อมูลที่อ่านได้
- แนะนำคำสั่ง /command ที่เหมาะสมให้ผู้ใช้
- ตอบเป็นภาษาไทย สุภาพ กระชับ
- ถ้าไม่มีข้อมูลที่ถาม ให้บอกตรงๆ ว่าไม่มีข้อมูล
- ห้ามสร้างข้อมูลขึ้นมาเอง

รูปแบบการตอบ:
- ห้ามใช้ markdown (ห้ามใช้ **, ##, \`\` หรือ markup อื่นๆ)
- ใช้ตัวเลขลำดับ (1. 2. 3.) หรือขีด (-) สำหรับรายการ
- เว้นบรรทัดระหว่างหัวข้อให้อ่านง่าย
- ใช้ข้อความธรรมดาเท่านั้น เพราะแสดงผลบน LINE

คำสั่งที่แนะนำได้:
- /list — ดูรายชื่อบริษัท
- /company <ชื่อ> — ดูข้อมูลบริษัท
- /shareholders <ชื่อ> — ดูผู้ถือหุ้น
- /docs <ชื่อ> — ดูเอกสาร
- /history <ชื่อ> — ดูประวัติเปลี่ยนแปลง`;

interface DocRef {
  name: string;
  fileId: string; // storagePath or driveFileId
  companyName: string;
}

function findReferencedDocuments(userMessage: string, allDocuments: DocRef[]): DocRef[] {
  const msg = userMessage.toLowerCase();
  const matches: DocRef[] = [];

  for (const doc of allDocuments) {
    // Strip date suffix e.g. "หนังสือรับรอง (01/02/2026)" → "หนังสือรับรอง"
    const baseName = doc.name.replace(/\s*\([\d\/]+\)\s*$/, '').trim();
    if (!baseName) continue;

    // Check if the document name tokens appear in the user message
    const nameTokens = baseName.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const matched = nameTokens.every(token => msg.includes(token));
    if (matched) {
      matches.push(doc);
    }
  }

  // Return at most 1 document to save tokens
  return matches.slice(0, 1);
}

export async function handleAIChat(
  userId: string,
  userMessage: string,
  accessibleCompanyNames: string[]
): Promise<string> {
  try {
    const anthropic = getClient();

    // Collect all documents across companies
    const allDocuments: DocRef[] = [];

    // Load accessible company data as context (compact format to reduce tokens)
    const companiesData = await Promise.all(
      accessibleCompanyNames.map(async (name) => {
        try {
          const company = await parseCompanySheet(name);
          // Collect documents for OCR matching — prefer storagePath, fallback to driveFileId
          for (const d of company.documents) {
            const fid = d.storagePath || d.driveFileId;
            if (fid) {
              allDocuments.push({
                name: d.name,
                fileId: fid,
                companyName: company.companyNameTh || name,
              });
            }
          }
          const directors = company.directors.map(d => d.name).join(', ');
          const shareholders = company.shareholders.map(s => `${s.name}(${s.shares})`).join(', ');
          const docs = company.documents.map(d => d.name).join(', ');
          return `[${company.companyNameTh}] ทะเบียน:${company.registrationNumber} | กรรมการ:${directors} | อำนาจ:${company.authorizedSignatory} | ทุน:${company.capitalText || company.registeredCapital} | ผู้ถือหุ้น:${shareholders} | เอกสาร:${docs}`;
        } catch {
          return `[${name}] (โหลดไม่ได้)`;
        }
      })
    );

    // Find and download referenced documents
    const referencedDocs = findReferencedDocuments(userMessage, allDocuments);
    const docBlocks: Anthropic.ContentBlockParam[] = [];

    for (const doc of referencedDocs) {
      try {
        const { buffer, mimeType } = await fetchAndCache(doc.fileId);

        if (mimeType === 'application/pdf') {
          if (buffer.length > 10 * 1024 * 1024) {
            console.warn(`Document too large (${buffer.length} bytes), skipping: ${doc.name}`);
            continue;
          }
          docBlocks.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: buffer.toString('base64'),
            },
          } as any);
        } else if (mimeType.startsWith('image/')) {
          if (buffer.length > 4.5 * 1024 * 1024) {
            console.warn(`Image too large (${buffer.length} bytes), skipping: ${doc.name}`);
            continue;
          }
          docBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: buffer.toString('base64'),
            },
          });
        }
        // Other MIME types: skip silently
      } catch (err: any) {
        console.error(`Failed to fetch document "${doc.name}":`, err.message);
      }
    }

    const hasDocuments = docBlocks.length > 0;

    // Load chat history
    const history = await getChatHistory(userId, 10);
    const messages: Anthropic.MessageParam[] = history.map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.message,
    }));

    // Build the user message — with document blocks if available
    if (hasDocuments) {
      messages.push({
        role: 'user',
        content: [...docBlocks, { type: 'text', text: userMessage }],
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: hasDocuments ? 2048 : 1024,
      system: `${SYSTEM_PROMPT}\n\nข้อมูลบริษัทที่ผู้ใช้มีสิทธิ์เข้าถึง:\n${companiesData.join('\n\n')}`,
      messages,
    });

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('');

    // Strip markdown that Claude might still use
    assistantMessage = assistantMessage
      .replace(/\*\*(.*?)\*\*/g, '$1')   // **bold** → bold
      .replace(/__(.*?)__/g, '$1')        // __bold__ → bold
      .replace(/\*(.*?)\*/g, '$1')        // *italic* → italic
      .replace(/#{1,6}\s+/g, '')          // ## heading → heading
      .replace(/`([^`]+)`/g, '$1');       // `code` → code

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
