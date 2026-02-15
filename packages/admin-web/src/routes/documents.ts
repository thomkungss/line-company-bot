import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDriveClient, getDriveFolderId, parseCompanySheet, updateDocumentInSheet, addDocumentToSheet } from '@company-bot/shared';
import { Readable } from 'stream';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const documentsRouter = Router();

/** Get documents for a company */
documentsRouter.get('/:sheet', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const company = await parseCompanySheet(sheet);
    res.json(company.documents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Upload document to Google Drive + auto update Sheet */
documentsRouter.post('/:sheet', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const drive = getDriveClient();
    const folderId = getDriveFolderId();
    const sheet: string = req.params.sheet as string;
    const documentName: string = (req.body.documentName || '').toString().trim();

    const fileMetadata = {
      name: req.file.originalname,
      parents: folderId ? [folderId] : undefined,
      description: `Document for ${sheet}`,
    };

    const media = {
      mimeType: req.file.mimetype,
      body: Readable.from(req.file.buffer),
    };

    const driveRes = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id,name,webViewLink',
    });

    const fileId = (driveRes as any).data.id;
    const webViewLink = (driveRes as any).data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

    // Auto update Google Sheet with new link + date
    let sheetUpdated = false;
    if (documentName) {
      const updated = await updateDocumentInSheet(sheet, documentName, webViewLink);
      if (updated) {
        sheetUpdated = true;
      } else {
        // Document name not found in sheet — add as new row
        await addDocumentToSheet(sheet, documentName, webViewLink);
        sheetUpdated = true;
      }
    }

    res.json({
      success: true,
      fileId,
      name: (driveRes as any).data.name,
      webViewLink,
      sheetUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Delete document from Google Drive */
documentsRouter.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;
    await drive.files.delete({ fileId });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Proxy download */
documentsRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    const meta = await drive.files.get({ fileId, fields: 'mimeType,name' });
    const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
    const fileName = (meta as any).data?.name || 'document';

    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    ((fileRes as any).data as Readable).pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: 'File not found' });
  }
});
