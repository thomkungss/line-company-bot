import { google, Auth } from 'googleapis';

let cachedAuth: Auth.GoogleAuth | null = null;

export function getGoogleAuth(): Auth.GoogleAuth {
  if (cachedAuth) return cachedAuth;

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  cachedAuth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return cachedAuth;
}

export function getSheetsClient() {
  const auth = getGoogleAuth();
  return google.sheets({ version: 'v4', auth: auth as any });
}

export function getDriveClient() {
  const auth = getGoogleAuth();
  return google.drive({ version: 'v3', auth: auth as any });
}

export function getSpreadsheetId(): string {
  return process.env.GOOGLE_SPREADSHEET_ID || '';
}

export function getDriveFolderId(): string {
  return process.env.GOOGLE_DRIVE_FOLDER_ID || '';
}
