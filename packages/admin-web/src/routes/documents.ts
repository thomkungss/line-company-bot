import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { getDriveClient, getDriveFolderId, parseCompanySheet, updateDocumentInSheet, addDocumentToSheet, updateSealInSheet, updateDocumentExpiry } from '@company-bot/shared';
import { Readable } from 'stream';
import { config } from '../config';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Cache of company folder IDs in Drive (sheetName → folderId)
const companyFolderCache = new Map<string, string>();

/** Get or create a company subfolder inside the root Drive folder */
async function getOrCreateCompanyFolder(drive: any, sheetName: string): Promise<string> {
  const cached = companyFolderCache.get(sheetName);
  if (cached) return cached;

  const rootFolderId = getDriveFolderId();

  // Search for existing folder
  const search = await drive.files.list({
    q: `name='${sheetName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });

  const existing = (search as any).data?.files?.[0];
  if (existing) {
    companyFolderCache.set(sheetName, existing.id);
    return existing.id;
  }

  // Create new folder
  const folderRes = await drive.files.create({
    requestBody: {
      name: sheetName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  const folderId = (folderRes as any).data?.id;
  if (!folderId) throw new Error('Failed to create company folder');

  companyFolderCache.set(sheetName, folderId);
  return folderId;
}

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

/** Upload document — all files stored on Google Drive */
documentsRouter.post('/:sheet', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const sheet: string = req.params.sheet as string;
    const documentName: string = (req.body.documentName || '').toString().trim();
    const expiryDate: string | undefined = (req.body.expiryDate || '').toString().trim() || undefined;

    const ext = path.extname(req.file.originalname) || '';

    // Upload to Google Drive — organized by company folder
    const drive = getDriveClient();
    const companyFolderId = await getOrCreateCompanyFolder(drive, sheet);
    const fileName = documentName ? `${documentName}${ext}` : req.file.originalname;
    const driveRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [companyFolderId],
      },
      media: {
        mimeType: req.file.mimetype || 'application/octet-stream',
        body: Readable.from(req.file.buffer),
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const driveFileId = (driveRes as any).data?.id;
    if (!driveFileId) throw new Error('Drive upload failed — no file ID returned');

    // Make file publicly readable
    await drive.permissions.create({
      fileId: driveFileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });

    const fileUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

    // Update Google Sheet
    let sheetUpdated = false;
    if (documentName === 'ตราประทับ') {
      sheetUpdated = await updateSealInSheet(sheet, driveFileId);
    } else if (documentName) {
      const updated = await updateDocumentInSheet(sheet, documentName, fileUrl, expiryDate);
      if (updated) {
        sheetUpdated = true;
      } else {
        await addDocumentToSheet(sheet, documentName, fileUrl, expiryDate);
        sheetUpdated = true;
      }
    }

    res.json({
      success: true,
      fileUrl,
      driveFileId,
      name: documentName || req.file.originalname,
      sheetUpdated,
    });
  } catch (err: any) {
    console.error('Upload error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

/** Update expiry date for a specific document */
documentsRouter.put('/:sheet/expiry', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const { documentName, expiryDate } = req.body;
    if (!documentName) {
      res.status(400).json({ error: 'documentName is required' });
      return;
    }
    const result = await updateDocumentExpiry(sheet, documentName, expiryDate || '');
    if (result) {
      res.json({ success: true, row: result.row });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Delete document from Google Drive (for existing Drive files) */
documentsRouter.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;
    await drive.files.delete({ fileId, supportsAllDrives: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Proxy download from Google Drive (for existing Drive files) */
documentsRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const fileId: string = req.params.fileId as string;

    const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
    const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
    const fileName = (meta as any).data?.name || 'document';

    const fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    ((fileRes as any).data as Readable).pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: 'File not found' });
  }
});
