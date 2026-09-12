'use strict';

/**
 * Brings the live database up to db/schema.sql at start-up, additively.
 *
 * `db/migrate.js` is the reset tool: schema.sql drops all 23 tables before
 * recreating them, which is right for a first run and catastrophic on every deploy.
 * This is the other half - it reads the same file as the description of what *should*
 * exist, and only ever adds what is missing:
 *
 *   - a table in schema.sql that the database does not have  -> CREATE TABLE
 *   - a column in schema.sql that an existing table lacks    -> ALTER TABLE ADD COLUMN
 *
 * It never drops a table, never drops a column, and never changes the type of a
 * column that already exists. Those are the operations that lose data, and deciding
 * whether a particular one is safe is not something a start-up routine should be
 * guessing at - a column whose type genuinely has to change needs a human and a
 * backup. Such a difference is reported and left alone.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

/** Anything in a table body that defines something other than a column. */
const NOT_A_COLUMN = /^(PRIMARY\s+KEY|UNIQUE\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|FULLTEXT|SPATIAL|CHECK)\b/i;

/**
 * Splits a table body on commas that are not inside brackets or quotes.
 *
 * Splitting on lines would not do: a definition can wrap, and an ENUM or a COMMENT
 * can legitimately contain a comma - `ENUM('simple','packages')` must stay whole.
 */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (quote) {
      current += ch;
      if (ch === quote && body[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Every `CREATE TABLE` in the file, with its columns in declared order. */
function parseSchema(sql) {
  const tables = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/gi;

  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const open = re.lastIndex - 1;

    // walk to the matching close bracket
    let depth = 0;
    let end = -1;
    let quote = null;
    for (let i = open; i < sql.length; i++) {
      const ch = sql[i];
      if (quote) {
        if (ch === quote && sql[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) continue;

    const body = sql.slice(open + 1, end);
    const tail = sql.slice(end + 1, sql.indexOf(';', end) + 1).trim(); // ENGINE=... ;

    const columns = [];
    for (const part of splitTopLevel(body)) {
      if (!part || NOT_A_COLUMN.test(part)) continue;
      const col = part.match(/^`?(\w+)`?\s+/);
      if (col) columns.push({ name: col[1], definition: part.replace(/\s+/g, ' ').trim() });
    }

    tables.push({
      name,
      columns,
      create: `CREATE TABLE IF NOT EXISTS \`${name}\` (\n${body.trim()}\n) ${tail}`.replace(/;?$/, ''),
    });
  }
  return tables;
}

/**
 * Applies the additive differences. Returns what it did, so the caller can log it.
 *
 * @param {{query: Function, config: {database: string}}} db
 */
async function syncSchema(db, { logger = console } = {}) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const wanted = parseSchema(sql);
  const database = db.config.database;

  const rows = await db.query(
    'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [database]
  );
  const existing = new Set(rows.map((r) => r.t));

  const created = [];
  const added = [];
  const mismatched = [];

  // Foreign keys reference tables further down the file, so ordering cannot be
  // satisfied in one pass. The checks are restored in the finally block below.
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of wanted) {
      if (!existing.has(table.name)) {
        await db.query(table.create);
        created.push(table.name);
        continue;
      }

      const have = await db.query(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [database, table.name]
      );
      const byName = new Map(have.map((c) => [c.name.toLowerCase(), c]));

      let previous = null;
      for (const col of table.columns) {
        if (byName.has(col.name.toLowerCase())) {
          previous = col.name;
          continue;
        }
        // Keep the declared order where possible; a column with no predecessor
        // present goes first rather than being appended out of sequence.
        const position = previous ? `AFTER \`${previous}\`` : 'FIRST';
        await db.query(`ALTER TABLE \`${table.name}\` ADD COLUMN ${col.definition} ${position}`);
        added.push(`${table.name}.${col.name}`);
        previous = col.name;
      }
    }
  } finally {
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  if (created.length) logger.log(`  schema created ${created.length} table(s): ${created.join(', ')}`);
  if (added.length) logger.log(`  schema added ${added.length} column(s): ${added.join(', ')}`);
  if (mismatched.length) {
    logger.warn(`  schema ${mismatched.length} column(s) differ in type and were left alone: ${mismatched.join(', ')}`);
  }
  if (!created.length && !added.length) logger.log('  schema up to date');

  return { created, added, mismatched, tables: wanted.length };
}

module.exports = { syncSchema, parseSchema, splitTopLevel };
