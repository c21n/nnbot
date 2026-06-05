/**
 * Database Migration Runner
 *
 * Runs SQL migration files in order.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection, closePool } from '../connection.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run all migrations
 */
async function runMigrations(): Promise<void> {
  logger.info('Starting database migrations...');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }

  // Create migrations table if not exists
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get list of executed migrations
  const result = await query<{ name: string }>(
    'SELECT name FROM migrations ORDER BY id'
  );
  const executed = new Set(result.rows.map(r => r.name));

  // Migration files in order
  const migrations = [
    '001_initial_schema.sql',
  ];

  // Run pending migrations
  for (const migration of migrations) {
    if (executed.has(migration)) {
      logger.info(`Migration ${migration} already executed, skipping`);
      continue;
    }

    logger.info(`Running migration: ${migration}`);

    try {
      // Read SQL file
      const sqlPath = join(__dirname, migration);
      const sql = readFileSync(sqlPath, 'utf-8');

      // Execute migration
      await query(sql);

      // Record migration
      await query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migration]
      );

      logger.info(`Migration ${migration} completed`);
    } catch (err) {
      logger.error(`Migration ${migration} failed`, err);
      throw err;
    }
  }

  logger.info('All migrations completed');
}

// Run if called directly
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  runMigrations()
    .then(() => {
      logger.info('Migrations finished successfully');
      return closePool();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed', err);
      return closePool();
    })
    .then(() => {
      process.exit(1);
    });
}

export { runMigrations };
