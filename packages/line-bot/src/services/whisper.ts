import OpenAI from 'openai';
import { config } from '../config';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const openai = getClient();

  const file = new File([audioBuffer], 'audio.m4a', { type: 'audio/m4a' });

  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'th',
  });

  return transcription.text;
}
