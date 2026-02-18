import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import {
  getDriveClient,
  parseCompanySheet,
  updateDocumentInSheet, addDocumentToSheet,
  updateSealInSheet, updateDocumentExpiry, removeDocumentFromSheet,
  uploadToStorage, deleteFromStorage, getPublicUrl, sanitizeStorageName,
  getSupabase,
} from '@company-bot/shared';
import { Readable } from 'stream';
import { config } from '../config';

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

/** Upload document — stored on Supabase Storage */
documentsRouter.post('/:sheet', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const sheet: string = req.params.sheet as string;
    const documentName: string = (req.body.documentName || '').toString().trim();
    const expiryDate: string | undefined = (req.body.expiryDate || '').toString().trim() || undefined;

    // Validate file type: ตราประทับ allows images, others require PDF
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isPdf = ext === '.pdf' || req.file.mimetype === 'application/pdf' || req.file.mimetype === 'application/x-pdf';
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) || req.file.mimetype.startsWith('image/');

    if (documentName === 'ตราประทับ') {
      if (!isPdf && !isImage) {
        res.status(400).json({ error: 'อนุญาตเฉพาะไฟล์ PDF หรือรูปภาพ' });
        return;
      }
    } else {
      if (!isPdf) {
        res.status(400).json({ error: 'อนุญาตเฉพาะไฟล์ PDF เท่านั้น' });
        return;
      }
    }

    // Build file name: sanitized for Supabase Storage (ASCII-only paths)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dateSuffix = `${dd}-${mm}-${yyyy}`;
    const fileExt = ext || '.pdf';
    const safeDocName = sanitizeStorageName(documentName || path.basename(req.file.originalname, ext));
    const safeFileName = `${safeDocName}_${dateSuffix}${fileExt}`;
    const contentType = req.file.mimetype || 'application/octet-stream';

    // Use company DB ID as folder name (ASCII-safe, unique)
    const sb = getSupabase();
    const { data: companyRow } = await sb.from('companies').select('id').eq('sheet_name', sheet).single();
    if (!companyRow) { res.status(404).json({ error: 'Company not found' }); return; }
    const companyFolder = String(companyRow.id);

    let sheetUpdated = false;

    if (documentName === 'ตราประทับ') {
      // Seal → upload to public 'seals' bucket
      const storagePath = `${companyFolder}/${safeFileName}`;
      await uploadToStorage('seals', storagePath, req.file.buffer, contentType);
      const publicUrl = getPublicUrl('seals', storagePath);
      sheetUpdated = await updateSealInSheet(sheet, '', storagePath, publicUrl);

      res.json({
        success: true,
        storagePath,
        storageUrl: publicUrl,
        name: documentName,
        sheetUpdated,
      });
    } else {
      // Document → upload to private 'documents' bucket
      const storagePath = `${companyFolder}/${safeFileName}`;
      await uploadToStorage('documents', storagePath, req.file.buffer, contentType);

      if (documentName) {
        const updated = await updateDocumentInSheet(sheet, documentName, '', expiryDate, storagePath);
        if (updated) {
          // Delete old storage file if it was replaced
          if (updated.oldStoragePath) {
            try { await deleteFromStorage('documents', updated.oldStoragePath); } catch {}
          }
          sheetUpdated = true;
        } else {
          await addDocumentToSheet(sheet, documentName, '', expiryDate, storagePath);
          sheetUpdated = true;
        }
      }

      res.json({
        success: true,
        storagePath,
        name: documentName || req.file.originalname,
        sheetUpdated,
      });
    }
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

/** Remove document row from Google Sheet */
documentsRouter.delete('/:sheet/row/:docName', async (req: Request, res: Response) => {
  try {
    const sheet: string = req.params.sheet as string;
    const docName: string = req.params.docName as string;
    const removed = await removeDocumentFromSheet(sheet, docName);
    if (removed) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Document row not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Delete document file — supports both Supabase Storage and Google Drive */
documentsRouter.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;
    const storagePath = req.query.storagePath as string | undefined;

    if (storagePath) {
      // Supabase Storage delete
      await deleteFromStorage('documents', storagePath);
    } else {
      // Legacy: Google Drive delete
      const drive = getDriveClient();
      await drive.files.delete({ fileId, supportsAllDrives: true });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Proxy download — auto-routes to Supabase Storage or Google Drive */
documentsRouter.get('/download/:fileId(*)', async (req: Request, res: Response) => {
  try {
    const fileId: string = req.params.fileId as string;

    if (fileId.includes('/')) {
      // Supabase Storage path
      const { downloadFromStorage } = require('@company-bot/shared');
      const buffer = await downloadFromStorage('documents', fileId);
      const fileName = fileId.split('/').pop() || 'document';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      res.end(buffer);
    } else {
      // Legacy: Google Drive
      const drive = getDriveClient();
      const meta = await drive.files.get({ fileId, fields: 'mimeType,name', supportsAllDrives: true });
      const mimeType = (meta as any).data?.mimeType || 'application/octet-stream';
      const fileName = (meta as any).data?.name || 'document';
      const fileRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      ((fileRes as any).data as Readable).pipe(res);
    }
  } catch (err: any) {
    res.status(404).json({ error: 'File not found' });
  }
});
