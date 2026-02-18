/**
 * Run schema.sql against Supabase PostgreSQL directly.
 * Usage: node packages/shared/run-schema.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const sql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8');

// Supabase pooler connection (Tokyo ap-northeast-1)
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST || 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: process.env.SUPABASE_DB_USER || 'postgres.naiwzwrtteqlkezgznun',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('Connected! Running schema...\n');

  try {
    await client.query(sql);
    console.log('Schema created successfully!');

    // Verify tables
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\nTables in public schema:');
    res.rows.forEach(r => console.log(`  ✓ ${r.table_name}`));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
