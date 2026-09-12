'use strict';

const mysql = require('mysql2/promise');

/**
 * A single connection string, if one is set.
 *
 * Railway hands you the whole thing as MYSQL_URL (internal) or MYSQL_PUBLIC_URL (the
 * proxy you can reach from outside), and copying one value beats transcribing five
 * into DB_* aliases and getting one of them subtly wrong.
 */
function fromUrl() {
  const raw = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;
  if (!raw) return {};
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : undefined,
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database: u.pathname.replace(/^\//, '') || undefined,
    };
  } catch {
    console.warn('[db] connection string could not be parsed; falling back to DB_*/MYSQL* variables');
    return {};
  }
}

const url = fromUrl();

const config = {
  // Precedence: an explicit DB_* wins, then a connection string, then Railway's own
  // MYSQL* names, then the local default.
  host: process.env.DB_HOST || url.host || process.env.MYSQLHOST || 'localhost',
  port: Number(process.env.DB_PORT || url.port || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || url.user || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD ?? (url.password || undefined) ?? process.env.MYSQLPASSWORD ?? '',
  database: process.env.DB_NAME || url.database || process.env.MYSQLDATABASE || 'junubsoftflow',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4_unicode_ci',
};

const pool = mysql.createPool(config);

/** Run a query and return the rows. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Run a query and return the first row (or null). */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and return the raw result. */
async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/** Single scalar value from the first column of the first row. */
async function scalar(sql, params = [], fallback = 0) {
  const row = await one(sql, params);
  if (!row) return fallback;
  const value = Object.values(row)[0];
  return value === null || value === undefined ? fallback : value;
}

module.exports = { pool, query, one, run, scalar, config };
