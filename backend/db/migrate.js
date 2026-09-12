'use strict';

/**
 * Runs db/schema.sql against the MySQL server.
 * Usage: npm run migrate
 *
 * DESTRUCTIVE. schema.sql drops every table it then recreates, so this wipes an
 * existing database. It is a first-run/reset tool, not an incremental migration.
 *
 * Two things make a hosted database different from a local one, and both used to
 * break this script silently:
 *
 *  - Connection details. A managed provider supplies its own variable names -
 *    Railway uses MYSQLHOST and friends - so the config is taken from src/db.js,
 *    which already resolves them, rather than re-reading DB_* here and defaulting
 *    to localhost.
 *
 *  - Database name. schema.sql opens with `CREATE DATABASE junubsoftflow; USE
 *    junubsoftflow;`, but a managed database is usually named for you (Railway
 *    calls it `railway`) and the user often has no CREATE DATABASE grant. Those
 *    two statements are therefore rewritten to the configured name, and the
 *    create is attempted separately so a permission error there is survivable.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('../src/db');

/** Strips the `CREATE DATABASE ... USE ...;` header; returns the rest of the file. */
function withoutDatabaseHeader(sql) {
  return sql
    .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[^;]+;/i, '')
    .replace(/^\s*USE\s+[^;]+;/im, '');
}

async function main() {
  const { host, port, user, password, database } = db.config;
  const raw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  // Create the database only if we are allowed to; a managed one already exists.
  const root = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\`
       DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    // Expected on a hosted database, where the database is provisioned for you
    // and the user has no CREATE privilege. Only fatal if it is also missing.
    console.log(`> could not create "${database}" (${err.code}) - assuming it already exists`);
  }
  await root.end();

  const conn = await mysql.createConnection({
    host, port, user, password, database, multipleStatements: true,
  });

  /**
   * Refuse to destroy a database that has data in it.
   *
   * schema.sql drops all 23 tables before recreating them. That is correct for a
   * first run and catastrophic against anything real, and the mistake is easy to
   * make: this script calls dotenv.config(), so a DB_NAME in .env silently wins over
   * whatever the caller thought they were targeting on the command line.
   *
   * Pass --force (or CONFIRM_DESTRUCTIVE=yes) to mean it.
   */
  const forced = process.argv.includes('--force') || process.env.CONFIRM_DESTRUCTIVE === 'yes';
  if (!forced) {
    // `rows` is reserved in MariaDB, hence the alias
    const [[{ total }]] = await conn.query(
      `SELECT COALESCE(SUM(TABLE_ROWS), 0) AS total
         FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [database]
    );
    if (Number(total) > 0) {
      console.error(`refusing to run: ${database}@${host}:${port} already holds data (~${total} rows).`);
      console.error('db/schema.sql DROPS every table before recreating it, so this would erase it.');
      console.error('');
      console.error('  to add missing tables and columns without losing data, just start the API -');
      console.error('  it reconciles the schema on boot (src/schema-sync.js).');
      console.error('  to wipe and rebuild anyway: node db/migrate.js --force');
      await conn.end();
      process.exit(1);
    }
  }

  console.log(`> applying db/schema.sql to ${database}@${host}:${port} ...`);
  await conn.query(withoutDatabaseHeader(raw));

  const [tables] = await conn.query(
    'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [database]
  );

  console.log(`> ok - ${tables.length} tables in ${database}:`);
  console.log('  ' + tables.map((r) => r.t).join(', '));

  await conn.end();
}

main().catch((err) => {
  console.error('migration failed:', err.message);
  process.exit(1);
});
