import { Router, Request, Response } from 'express';
import { getDriveClient } from '@company-bot/shared';
import { Readable } from 'stream';

export const driveProxyRouter = Router();

/** Proxy seal image from Google Drive */
driveProxyRouter.get('/seal/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    // Get file metadata for content type
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name' });
    const mimeType = (meta as any).data?.mimeType || 'image/png';

    // Download file content
    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
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

/** Proxy document download from Google Drive */
driveProxyRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    // Get file metadata
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name,size' });
    const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
    const fileName = (meta as any).data?.name || 'document';

    // Download file content
    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    ((fileRes as any).data as Readable).pipe(res);
  } catch (err: any) {
    console.error('Drive download error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});
