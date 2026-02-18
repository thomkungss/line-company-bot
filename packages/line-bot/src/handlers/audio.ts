import { Client, MessageEvent } from '@line/bot-sdk';
import { getUserPermission } from '@company-bot/shared';
import { transcribeAudio } from '../services/whisper';
import { handleAIChat } from '../services/claude';
import { buildRegistrationPrompt, buildPendingApproval } from '../flex/registration';
import { config } from '../config';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB (Whisper limit)

export async function handleAudioMessage(client: Client, event: MessageEvent): Promise<void> {
  if (event.message.type !== 'audio') return;

  const userId = event.source.userId;
  if (!userId) return;

  console.log(`Audio message from userId: ${userId}, messageId: ${event.message.id}`);

  // Check permissions (same pattern as message.ts)
  const perm = await getUserPermission(userId);
  if (!perm) {
    await client.replyMessage(event.replyToken, buildRegistrationPrompt(config.liffId));
    return;
  }

  if (perm.approved === false) {
    await client.replyMessage(event.replyToken, buildPendingApproval());
    return;
  }

  const accessibleCompanies = Object.entries(perm.companies)
    .filter(([, hasAccess]) => hasAccess)
    .map(([name]) => name);

  if (accessibleCompanies.length === 0) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'คุณยังไม่มีสิทธิ์เข้าถึงบริษัทใดๆ กรุณารอการอนุมัติ',
    });
    return;
  }

  // Reply immediately to acknowledge receipt
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: '🎙️ กำลังฟังเสียง...',
  });

  try {
    // Download audio from LINE
    const stream = await client.getMessageContent(event.message.id);
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of stream) {
      totalSize += chunk.length;
      if (totalSize > MAX_AUDIO_SIZE) {
        await client.pushMessage(userId, {
          type: 'text',
          text: '❌ ไฟล์เสียงใหญ่เกินไป (จำกัด 25MB) กรุณาส่งเสียงที่สั้นลง',
        });
        return;
      }
      chunks.push(Buffer.from(chunk));
    }

    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length === 0) {
      await client.pushMessage(userId, {
        type: 'text',
        text: '❌ ไม่สามารถอ่านไฟล์เสียงได้ กรุณาลองใหม่',
      });
      return;
    }

    // Transcribe with Whisper
    let transcribedText: string;
    try {
      transcribedText = await transcribeAudio(audioBuffer);
    } catch (err: any) {
      console.error('Whisper transcription error:', err.message);
      await client.pushMessage(userId, {
        type: 'text',
        text: '❌ ไม่สามารถถอดเสียงได้ กรุณาพูดชัดขึ้นหรือลองใหม่',
      });
      return;
    }

    if (!transcribedText.trim()) {
      await client.pushMessage(userId, {
        type: 'text',
        text: '❌ ไม่พบเสียงพูดในไฟล์ กรุณาลองใหม่',
      });
      return;
    }

    console.log(`Transcribed text for ${userId}: ${transcribedText}`);

    // Send transcribed text to AI
    const aiResponse = await handleAIChat(userId, transcribedText, accessibleCompanies);

    // Push result back to user
    await client.pushMessage(userId, {
      type: 'text',
      text: `📝 "${transcribedText}"\n\n${aiResponse}`,
    });
  } catch (err: any) {
    console.error('Audio handler error:', err.message);
    await client.pushMessage(userId, {
      type: 'text',
      text: '❌ เกิดข้อผิดพลาดในการประมวลผลเสียง กรุณาลองใหม่',
    });
  }
}
