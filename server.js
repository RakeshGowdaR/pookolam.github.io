// Local HTTPS static server for testing the AR page.
// Camera access requires a secure context (HTTPS or localhost), so this
// generates a self-signed cert on first run and serves the folder over HTTPS.
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const selfsigned = require('selfsigned');

const ROOT = __dirname;
const PORT = process.env.PORT || 8443;
const CERT_DIR = path.join(ROOT, '.cert');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

async function ensureCert() {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          ...Object.values(os.networkInterfaces())
            .flat()
            .filter((i) => i && i.family === 'IPv4')
            .map((i) => ({ type: 7, ip: i.address })),
        ],
      },
    ],
  });
  fs.writeFileSync(KEY_PATH, pems.private);
  fs.writeFileSync(CERT_PATH, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mind': 'application/octet-stream',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
};

const LOG_PATH = path.join(ROOT, 'device-logs.ndjson');

function logLine(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  console.log('[log]', line);
  fs.appendFile(LOG_PATH, line + '\n', () => {});
}

async function main() {
  const { key, cert } = await ensureCert();

  const server = https.createServer({ key, cert }, (req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);

    if (req.method === 'POST' && reqPath === '/log') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = { raw: body }; }
        logLine({ kind: 'client', ua: req.headers['user-agent'], ...parsed });
        res.writeHead(204);
        res.end();
      });
      return;
    }

    logLine({ kind: 'request', method: req.method, path: reqPath, ua: req.headers['user-agent'] });

    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(ROOT, reqPath);

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found: ' + reqPath);
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // Mobile Chrome caches aggressively and a plain reload can silently
        // serve a stale index.html/app.js — never cache during development.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      });
      res.end(data);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i.address);

    console.log(`\nAR dev server running (HTTPS, self-signed cert):`);
    console.log(`  https://localhost:${PORT}`);
    addresses.forEach((addr) => console.log(`  https://${addr}:${PORT}  <-- open this on the tablet (same wifi)`));
    console.log(`\nChrome will warn "not private" the first time (self-signed cert) — tap Advanced > Proceed. This is expected.\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
