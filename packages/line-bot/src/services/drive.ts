import { Router, Request, Response } from 'express';
import { getDriveClient } from '@company-bot/shared';
import { Readable } from 'stream';

export const driveProxyRouter = Router();

// In-memory cache for Drive files (5 min TTL)
const fileCache = new Map<string, { buffer: Buffer; mimeType: string; fileName: string; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(fileId: string) {
  const entry = fileCache.get(fileId);
  if (entry && Date.now() < entry.expiry) return entry;
  if (entry) fileCache.delete(fileId);
  return null;
}

async function fetchAndCache(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const cached = getCached(fileId);
  if (cached) return cached;

  const drive = getDriveClient();
  const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
  const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
  const fileName = (meta as any).data?.name || 'document';

  const exportTypes: Record<string, string> = {
    'application/vnd.google-apps.document': 'application/pdf',
    'application/vnd.google-apps.spreadsheet': 'application/pdf',
    'application/vnd.google-apps.presentation': 'application/pdf',
  };

  let fileRes;
  let finalMimeType = mimeType;
  if (exportTypes[mimeType]) {
    fileRes = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'stream' }
    );
    finalMimeType = 'application/pdf';
  } else {
    fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = (fileRes as any).data as Readable;
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const buffer = Buffer.concat(chunks);

  const entry = { buffer, mimeType: finalMimeType, fileName, expiry: Date.now() + CACHE_TTL };
  fileCache.set(fileId, entry);
  return entry;
}

/** Proxy seal image from Google Drive */
driveProxyRouter.get('/seal/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    // Get file metadata for content type
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
    const mimeType = (meta as any).data?.mimeType || 'image/png';

    // Download file content
    const fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    ((fileRes as any).data as Readable).pipe(res);
  } catch (err: any) {
    console.error('Drive seal proxy error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

/** View document as PDF inline in browser */
driveProxyRouter.get('/view/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;
    const { buffer, mimeType, fileName } = await fetchAndCache(fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(buffer);
  } catch (err: any) {
    console.error('Drive view error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

/** Proxy document download from Google Drive */
driveProxyRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;
    const { buffer, mimeType, fileName } = await fetchAndCache(fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.end(buffer);
  } catch (err: any) {
    console.error('Drive download error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});
