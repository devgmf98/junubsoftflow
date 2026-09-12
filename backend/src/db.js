'use strict';

const mysql = require('mysql2/promise');

const config = {
  // Railway's MySQL plugin injects MYSQL* names of its own; accepting them means a
  // deployment works without hand-copying five values into DB_* aliases.
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'junubsoftflow',
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
