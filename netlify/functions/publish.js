// Netlify Function: publish
// Ontvangt de huidige state van de browser, vervangt START_DATA in app.js en deployt naar Netlify.

const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');

const SITE_ID  = '5c5f8e1f-7b2d-4058-b9a0-16a907f7cc28';
const TOKEN    = 'nfp_oWbYrHLqptpem5mToF8q8DWZ8vNsi1Qvc0de';
const SITE_URL = 'familie-stamboom.netlify.app';

// ── HTTPS helpers ────────────────────────────────────────────────────────────
function httpsGet(hostname, reqPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: reqPath, method: 'GET', headers: { 'User-Agent': 'netlify-fn' } },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname, reqPath, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = https.request(
      {
        hostname, path: reqPath, method: 'POST',
        headers: { 'Content-Length': buf.length, ...extraHeaders },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ── CRC32 ────────────────────────────────────────────────────────────────────
function makeCrcTable() {
  const t = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}
const CRC_TABLE = makeCrcTable();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return ((crc ^ 0xFFFFFFFF) | 0);
}

// ── ZIP builder ───────────────────────────────────────────────────────────────
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw     = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp    = zlib.deflateRawSync(raw, { level: 6 });
    const crc     = crc32(raw);

    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28); nameBuf.copy(lh, 30);
    const entry = Buffer.concat([lh, comp]);
    locals.push(entry);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    centrals.push(cd);
    offset += entry.length;
  }
  const cdBuf = Buffer.concat(centrals);
  const eocd  = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const body = JSON.parse(event.body);
    if (!body || !body.state) throw new Error('Geen state ontvangen');
    const state = body.state;

    const ts = Date.now();

    // 1. Haal de drie bestanden op van de live site
    const [htmlRes, cssRes, jsRes] = await Promise.all([
      httpsGet(SITE_URL, `/index.html?_=${ts}`),
      httpsGet(SITE_URL, `/style.css?_=${ts}`),
      httpsGet(SITE_URL, `/app.js?_=${ts}`),
    ]);

    if (htmlRes.status !== 200) throw new Error(`index.html: HTTP ${htmlRes.status}`);
    if (cssRes.status  !== 200) throw new Error(`style.css: HTTP ${cssRes.status}`);
    if (jsRes.status   !== 200) throw new Error(`app.js: HTTP ${jsRes.status}`);

    const html   = htmlRes.body;
    const css    = cssRes.body;
    const jsText = jsRes.body;

    if (!jsText.includes('__START_DATA_BEGIN__')) throw new Error('Marker __START_DATA_BEGIN__ niet gevonden in app.js');

    // 2. Vervang START_DATA met huidige state
    const newVersion = ts;
    const newState   = Object.assign({}, state, { _version: newVersion });
    const replacement =
      '// __START_DATA_BEGIN__\n' +
      'const START_DATA = ' + JSON.stringify(newState, null, 2) + ';\n' +
      '// __START_DATA_END__';

    const newJs = jsText.replace(
      /\/\/ __START_DATA_BEGIN__[\s\S]*?\/\/ __START_DATA_END__/,
      replacement
    );

    // 3. Lees eigen functie-bestand; toml is ingebakken als string
    const selfJs = fs.readFileSync(__filename, 'utf8');
    const toml   = '[build]\n  functions = "netlify/functions"\n\n[build.environment]\n  NODE_VERSION = "18"\n';

    // 4. Maak ZIP
    const zip = makeZip([
      { name: 'index.html',                   data: html   },
      { name: 'style.css',                    data: css    },
      { name: 'app.js',                       data: newJs  },
      { name: 'netlify.toml',                 data: toml   },
      { name: 'netlify/functions/publish.js', data: selfJs },
    ]);

    // 5. Deploy naar Netlify API
    const deployRes = await httpsPost(
      'api.netlify.com',
      `/api/v1/sites/${SITE_ID}/deploys`,
      zip,
      { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/zip' }
    );

    if (deployRes.status !== 200) {
      throw new Error(`Netlify deploy fout (${deployRes.status}): ${deployRes.body.slice(0, 300)}`);
    }

    const result = JSON.parse(deployRes.body);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, version: newVersion, deployId: result.id, state: result.state }),
    };

  } catch (err) {
    console.error('[publish]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
