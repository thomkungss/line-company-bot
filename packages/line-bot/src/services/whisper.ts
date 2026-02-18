import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

  // Write to temp file — Node 18 doesn't have global File class
  const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}.m4a`);
  fs.writeFileSync(tmpPath, audioBuffer);

  try {
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(tmpPath),
      language: 'th',
    });

    return transcription.text;
  } finally {
    // Cleanup temp file
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}
