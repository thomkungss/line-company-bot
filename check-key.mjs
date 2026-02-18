import { config } from 'dotenv';
config();

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
console.log('Has private_key:', Boolean(creds.private_key));
console.log('Key starts with:', creds.private_key?.substring(0, 50));
console.log('Contains literal \\n:', creds.private_key?.includes('\\n'));
console.log('Contains real newlines:', creds.private_key?.includes('\n'));
console.log('Key length:', creds.private_key?.length);
console.log('project_id:', creds.project_id);
console.log('client_email:', creds.client_email);
