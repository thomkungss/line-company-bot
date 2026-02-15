import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDriveClient, getDriveFolderId, parseCompanySheet, updateDocumentInSheet, addDocumentToSheet, updateSealInSheet } from '@company-bot/shared';
import { Readable } from 'stream';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Cache company folder IDs to avoid repeated lookups
const companyFolderCache = new Map<string, string>();

/** Find or create a subfolder for the company inside the root Drive folder */
async function getOrCreateCompanyFolder(drive: any, rootFolderId: string, companyName: string): Promise<string> {
  // Check cache first
  const cached = companyFolderCache.get(companyName);
  if (cached) return cached;

  // Search for existing folder
  const searchRes = await drive.files.list({
    q: `name='${companyName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
  });
  const existing = searchRes.data.files;
  if (existing && existing.length > 0) {
    companyFolderCache.set(companyName, existing[0].id);
    return existing[0].id;
  }

  // Create new folder
  const folderRes = await drive.files.create({
    requestBody: {
      name: companyName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id',
  });
  const folderId = folderRes.data.id;
  companyFolderCache.set(companyName, folderId);
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

/** Upload document to Google Drive + auto update Sheet */
documentsRouter.post('/:sheet', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const drive = getDriveClient();
    const rootFolderId = getDriveFolderId();
    const sheet: string = req.params.sheet as string;
    const documentName: string = (req.body.documentName || '').toString().trim();

    // Get or create company subfolder
    const companyFolderId = rootFolderId
      ? await getOrCreateCompanyFolder(drive, rootFolderId, sheet)
      : undefined;

    // Name file: "ชื่อเอกสาร.ext" inside company folder
    const ext = req.file.originalname.includes('.') ? req.file.originalname.substring(req.file.originalname.lastIndexOf('.')) : '';
    const baseName = documentName || req.file.originalname.replace(/\.[^.]+$/, '');
    const driveName = `${baseName}${ext}`;

    const fileMetadata = {
      name: driveName,
      parents: companyFolderId ? [companyFolderId] : undefined,
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

    // Auto update Google Sheet
    let sheetUpdated = false;
    if (documentName === 'ตราประทับ') {
      // Seal image — update sealImageDriveId in sheet
      sheetUpdated = await updateSealInSheet(sheet, fileId);
    } else if (documentName) {
      const updated = await updateDocumentInSheet(sheet, documentName, webViewLink);
      if (updated) {
        sheetUpdated = true;
      } else {
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
    console.error('Upload error:', err.message, err.stack);
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
