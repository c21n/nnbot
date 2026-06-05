/**
 * Database Connection
 *
 * PostgreSQL connection pool management.
 */

import pg from 'pg';
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

/**
 * Database connection pool (singleton)
 */
let pool: pg.Pool | null = null;

/**
 * Get database connection pool
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });

    logger.info('Database connection pool created');
  }

  return pool;
}

/**
 * Execute a query
 */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 100) {
    logger.warn(`Slow query (${duration}ms): ${text}`);
  }

  return result;
}

/**
 * Get a client from the pool (for transactions)
 */
export async function getClient(): Promise<pg.PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    logger.info('Database connection test successful', { time: result.rows[0] });
    return true;
  } catch (err) {
    logger.error('Database connection test failed', err);
    return false;
  }
}
