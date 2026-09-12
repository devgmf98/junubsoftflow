'use strict';

/**
 * Runs db/schema.sql against the MySQL server.
 * Usage: npm run migrate
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log('> applying db/schema.sql ...');
  await conn.query(sql);

  const [tables] = await conn.query(
    'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [process.env.DB_NAME || 'junubsoftflow']
  );

  console.log(`> ok - ${tables.length} tables in ${process.env.DB_NAME || 'junubsoftflow'}:`);
  console.log('  ' + tables.map((r) => r.t).join(', '));

  await conn.end();
}

main().catch((err) => {
  console.error('migration failed:', err.message);
  process.exit(1);
});
