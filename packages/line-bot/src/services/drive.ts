import { Router, Request, Response } from 'express';
import { getDriveClient, downloadFromStorage } from '@company-bot/shared';
import { Readable } from 'stream';

export const driveProxyRouter = Router();

// In-memory cache for files (5 min TTL)
const fileCache = new Map<string, { buffer: Buffer; mimeType: string; fileName: string; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(fileId: string) {
  const entry = fileCache.get(fileId);
  if (entry && Date.now() < entry.expiry) return entry;
  if (entry) fileCache.delete(fileId);
  return null;
}

/**
 * Determine if a fileId is a Supabase Storage path or a Google Drive ID.
 * Storage paths always contain '/' (e.g. "companyName/doc.pdf").
 * Drive IDs never contain '/'.
 */
function isStoragePath(fileId: string): boolean {
  return fileId.includes('/');
}

async function fetchFromDrive(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
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
  return { buffer: Buffer.concat(chunks), mimeType: finalMimeType, fileName };
}

async function fetchFromSupabaseStorage(storagePath: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const buffer = await downloadFromStorage('documents', storagePath);
  const fileName = storagePath.split('/').pop() || 'document';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';
  return { buffer, mimeType, fileName };
}

/** Fetch file from Storage or Drive with in-memory caching */
export async function fetchAndCache(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const cached = getCached(fileId);
  if (cached) return cached;

  const result = isStoragePath(fileId)
    ? await fetchFromSupabaseStorage(fileId)
    : await fetchFromDrive(fileId);

  const entry = { ...result, expiry: Date.now() + CACHE_TTL };
  fileCache.set(fileId, entry);
  return entry;
}

/** Proxy seal image — supports Drive ID and Storage path */
driveProxyRouter.get('/seal/:fileId(*)', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;

    if (isStoragePath(fileId)) {
      // Supabase Storage seal (from 'seals' bucket)
      const buffer = await downloadFromStorage('seals', fileId);
      const ext = fileId.split('.').pop()?.toLowerCase() || 'png';
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
      res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(buffer);
    } else {
      // Legacy: Google Drive seal
      const drive = getDriveClient();
      const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
      const mimeType = (meta as any).data?.mimeType || 'image/png';
      const fileRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      ((fileRes as any).data as Readable).pipe(res);
    }
  } catch (err: any) {
    console.error('Seal proxy error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

/** View document as PDF inline in browser — auto-routes to Storage or Drive */
driveProxyRouter.get('/view/:fileId(*)', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;
    const { buffer, mimeType, fileName } = await fetchAndCache(fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(buffer);
  } catch (err: any) {
    console.error('View error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

/** Proxy document download — auto-routes to Storage or Drive */
driveProxyRouter.get('/download/:fileId(*)', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;
    const { buffer, mimeType, fileName } = await fetchAndCache(fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.end(buffer);
  } catch (err: any) {
    console.error('Download error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});
