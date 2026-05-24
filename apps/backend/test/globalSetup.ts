import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Runs once before the whole integration suite (configured as vitest globalSetup).
// Ensures a dedicated `gambling_test` database exists and is migrated to the
// current schema, so route tests run against a real Postgres — never the dev DB.
const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_DB = 'gambling_test';
// Maintenance connection (default `postgres` db) used only to CREATE DATABASE.
const ADMIN_URL =
  process.env.TEST_ADMIN_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_URL =
  process.env.DATABASE_URL ?? `postgresql://postgres:postgres@localhost:5432/${TEST_DB}`;

export default async function setup(): Promise<void> {
  // 1. Create the test database if it does not exist yet.
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB,
    ]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await admin.end();
  }

  // 2. Apply all migrations to the test database.
  const pool = new Pool({ connectionString: TEST_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: resolve(__dirname, '../src/db/migrations') });
  } finally {
    await pool.end();
  }
}
