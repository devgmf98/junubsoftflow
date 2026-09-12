'use strict';

/**
 * Builds small, genuinely valid .zip archives used as stand-in installers for the
 * seeded catalogue. Real builds are uploaded through the admin UI; these exist so
 * every seeded download link actually delivers a file instead of 404-ing.
 *
 * Written by hand rather than pulling in an archiver dependency - a stored/deflated
 * ZIP is a short, well-specified format.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** DOS date/time pair used by the ZIP headers. */
function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * @param {{name: string, data: string|Buffer}[]} entries
 * @returns {Buffer} a complete ZIP archive
 */
function makeZip(entries) {
  const { time, day } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const deflated = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // relative offset of local header
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, end]);
}

/**
 * Writes a placeholder installer archive and returns what the product_files row needs.
 *
 * @param {string} dir       storage/files
 * @param {object} meta      { product, label, platform, version }
 * @returns {{fileName: string, originalName: string, size: number}}
 */
function writePlaceholderBuild(dir, meta) {
  const slug = String(meta.label || 'build')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'build';

  const originalName = `${slug}.zip`;
  const fileName = `seed-${slug}-${meta.platform}.zip`;

  const readme = [
    `${meta.product} - ${meta.label}`,
    '='.repeat(`${meta.product} - ${meta.label}`.length),
    '',
    `Platform : ${meta.platform}`,
    `Version  : ${meta.version || 'n/a'}`,
    '',
    'This is a placeholder build that ships with the SoftFlow demo data so that',
    'every download link in the storefront resolves to a real file.',
    '',
    'It is not the actual vendor installer. Replace it from the admin console:',
    '  Admin -> Products -> (the product) -> Downloads -> Add a download',
    '',
    'Your licence key is delivered separately and is visible under',
    'My Account -> Delivery & Licences.',
    '',
  ].join('\n');

  const zip = makeZip([
    { name: 'README.txt', data: readme },
    { name: 'build/PLACEHOLDER', data: `${meta.product} ${meta.version || ''}\n`.trim() + '\n' },
  ]);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), zip);

  return { fileName, originalName, size: zip.length };
}

module.exports = { makeZip, crc32, writePlaceholderBuild };
