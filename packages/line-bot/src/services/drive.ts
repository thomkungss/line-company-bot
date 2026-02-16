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
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    // Get file metadata
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
    const mimeType = (meta as any).data?.mimeType || 'application/pdf';
    const fileName = (meta as any).data?.name || 'document';

    // If Google Docs/Sheets/Slides, export as PDF
    const exportTypes: Record<string, string> = {
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.spreadsheet': 'application/pdf',
      'application/vnd.google-apps.presentation': 'application/pdf',
    };

    let fileRes;
    if (exportTypes[mimeType]) {
      fileRes = await drive.files.export(
        { fileId, mimeType: 'application/pdf' },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else {
      fileRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', mimeType);
    }

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    ((fileRes as any).data as Readable).pipe(res);
  } catch (err: any) {
    console.error('Drive view error:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

/** Proxy document download from Google Drive */
driveProxyRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    // Get file metadata
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name,size', supportsAllDrives: true });
    const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
    const fileName = (meta as any).data?.name || 'document';

    // Download file content
    const fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
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
