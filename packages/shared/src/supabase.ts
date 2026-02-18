import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  client = createClient(url, key);
  return client;
}

// ===== Supabase Storage Helpers =====

/** Sanitize a file name for Supabase Storage (ASCII-only, no special chars) */
export function sanitizeStorageName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-]/g, '_')  // replace non-ASCII with underscore
    .replace(/_+/g, '_')                  // collapse multiple underscores
    .replace(/^_|_$/g, '');               // trim leading/trailing underscores
}

export async function uploadToStorage(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function downloadFromStorage(
  bucket: string,
  path: string,
): Promise<Buffer> {
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(bucket)
    .download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message || 'no data'}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteFromStorage(
  bucket: string,
  path: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.storage
    .from(bucket)
    .remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

export function getPublicUrl(bucket: string, path: string): string {
  const sb = getSupabase();
  const { data } = sb.storage
    .from(bucket)
    .getPublicUrl(path);
  return data.publicUrl;
}
