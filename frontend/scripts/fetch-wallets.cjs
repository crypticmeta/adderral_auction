#!/usr/bin/env node
/**
 * File: frontend/scripts/fetch-wallets.cjs
 * Purpose: Merge curated public Bitcoin addresses (mainnet + testnet) from local source files
 *          into frontend/public/wallets.json in a schema compatible with the backend User model.
 * Usage: yarn wallets:build
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_FILE = path.join(ROOT, 'public', 'wallets.json');
const SOURCES_DIR = path.join(__dirname, 'sources');
const URLS_FILE = path.join(SOURCES_DIR, 'urls.json');
const SPAWN_OPTS = { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 };

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function hasBsondump() {
  try {
    const r = spawnSync('bsondump', ['--version'], { encoding: 'utf8' });
    return r.status === 0 || (typeof r.stdout === 'string' && r.stdout.length > 0);
  } catch (_) {
    return false;
  }
}

function findBsonFiles(rootDir, onlyFiles) {
  const matches = [];
  const targetSet = Array.isArray(onlyFiles) && onlyFiles.length ? new Set(onlyFiles) : null;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        const isBson = ent.name.endsWith('.bson');
        if (!isBson) continue;
        if (targetSet && !targetSet.has(ent.name)) continue;
        matches.push(full);
      }
    }
  };
  walk(rootDir);
  return matches;
}

function loadFromBsonDir(dirPath, onlyFiles = ['sales.bson']) {
  const out = [];
  if (!dirPath) return out;
  if (!fs.existsSync(dirPath)) return out;
  if (!hasBsondump()) {
    console.warn('[warn] bsondump not found in PATH. Skipping BSON ingestion. Install MongoDB Database Tools.');
    return out;
  }
  // force exclude txes.bson even if passed via CLI
  const files = findBsonFiles(dirPath, onlyFiles).filter((f) => path.basename(f) !== 'txes.bson');
  if (!files.length) {
    console.warn(`[warn] No matching BSON files found under ${dirPath}. Looked for: ${onlyFiles.join(', ')}`);
    return out;
  }
  console.log(`[info] Wallets: scanning ${files.length} BSON file(s)`);
  for (const full of files) {
    console.log(`       - ${path.relative(dirPath, full)}`);
    const r = spawnSync('bsondump', ['--quiet', full], SPAWN_OPTS);
    if (r.status !== 0 || !r.stdout) {
      const code = r && typeof r.status === 'number' ? r.status : 'unknown';
      const err = r && r.stderr ? String(r.stderr).slice(0, 500) : '';
      console.warn(`[warn] bsondump failed for ${path.basename(full)} (status ${code}). ${err ? 'stderr: ' + err : ''}`);
      continue;
    }
    // bsondump typically emits JSON per line
    const lines = r.stdout.split(/\r?\n/).filter(Boolean);
    const addrs = new Set();
    const mapped = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // Direct fields commonly present in sales.bson
        if (obj && typeof obj === 'object') {
          const f = obj.from;
          const t = obj.to;
          const hasF = typeof f === 'string' && f.length > 0;
          const hasT = typeof t === 'string' && t.length > 0;
          if (hasF || hasT) {
            const network = hasF ? (isLikelyTestnet(f) ? 'testnet' : (isLikelyMainnet(f) ? 'mainnet' : null))
                                 : (hasT ? (isLikelyTestnet(t) ? 'testnet' : (isLikelyMainnet(t) ? 'mainnet' : null)) : null);
            if (network) {
              mapped.push(
                normalizeEntry({
                  cardinal_address: hasF ? f : null,
                  ordinal_address: hasT ? t : null,
                  network,
                  label: path.basename(full),
                  sourceUrl: `file://${full}`,
                })
              );
            }
          }
          if (hasF) addrs.add(f);
          if (hasT) addrs.add(t);
        }
        for (const a of extractAddressesFromJson(obj)) addrs.add(a);
      } catch (_) {
        // ignore malformed line
      }
    }
    console.log(`[info] Extracted ${addrs.size} candidate address(es) from ${path.basename(full)}; mapped pairs: ${mapped.length}`);
    // Push explicit mapped entries first (from/to mapping)
    for (const e of mapped) out.push(e);
    // Then push any additional addresses found that weren't covered by from/to
    const covered = new Set(mapped.flatMap(e => [e.cardinal_address, e.ordinal_address].filter(Boolean)));
    for (const addr of addrs) {
      if (covered.has(addr)) continue;
      const network = isLikelyTestnet(addr) ? 'testnet' : (isLikelyMainnet(addr) ? 'mainnet' : null);
      if (!network) continue;
      out.push(
        normalizeEntry({
          address: addr,
          network,
          label: path.basename(full),
          sourceUrl: `file://${full}`,
        })
      );
    }
  }
  return out;
}

function extractTxidsFromJson(json) {
  const out = new Set();
  const visit = (v, key) => {
    if (v == null) return;
    const t = typeof v;
    if (t === 'string') {
      const s = v;
      if (/^[0-9a-fA-F]{64}$/.test(s) || (key && /txid|tx_id|transaction_id/i.test(String(key)))) out.add(s);
    } else if (Array.isArray(v)) {
      for (const it of v) visit(it, undefined);
    } else if (t === 'object') {
      for (const k of Object.keys(v)) visit(v[k], k);
    }
  };
  visit(json, undefined);
  return Array.from(out);
}

function loadTxidsFromSales(dirPath) {
  const out = new Set();
  if (!dirPath || !fs.existsSync(dirPath) || !hasBsondump()) return [];
  const files = findBsonFiles(dirPath, ['sales.bson']);
  if (!files.length) return [];
  console.log(`[info] TXIDs: scanning ${files.length} sales.bson file(s)`);
  for (const full of files) {
    console.log(`       - ${path.relative(dirPath, full)}`);
    const r = spawnSync('bsondump', ['--quiet', full], SPAWN_OPTS);
    if (r.status !== 0 || !r.stdout) continue;
    const lines = r.stdout.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        // 1) Fast path: regex scan raw line for 64-hex substrings
        const m = line.match(/[0-9a-fA-F]{64}/g);
        if (m) for (const h of m) out.add(h);
        // 2) Structured path: parse and read common keys
        const obj = JSON.parse(line);
        if (obj && typeof obj === 'object') {
          const keys = ['txid', 'tx_id', 'transaction_id', 'tx_hash', 'hash'];
          for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v)) out.add(v);
          }
        }
        // 3) Recursive fallback
        for (const txid of extractTxidsFromJson(obj)) out.add(txid);
      } catch (_) {}
    }
  }
  const arr = Array.from(out);
  if (arr.length) {
    const sample = arr.slice(0, 5);
    console.log(`[info] TXID sample: ${sample.join(', ')}`);
  }
  return arr;
}

function isLikelyMainnet(addr) {
  if (typeof addr !== 'string') return false;
  return addr.startsWith('1') || addr.startsWith('3') || addr.startsWith('bc1');
}

function isLikelyTestnet(addr) {
  if (typeof addr !== 'string') return false;
  return addr.startsWith('m') || addr.startsWith('n') || addr.startsWith('2') || addr.startsWith('tb1');
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    try {
      https
        .get(url, { headers: { 'User-Agent': 'acornAuction-wallet-fetch/1.0' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // follow one redirect
            return resolve(fetchUrl(res.headers.location));
          }
          if (res.statusCode !== 200) {
            res.resume();
            return resolve('');
          }
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        })
        .on('error', () => resolve(''));
    } catch (e) {
      resolve('');
    }
  });
}

function extractAddresses(text) {
  if (!text) return [];
  const addrs = new Set();
  // Bech32 mainnet bc1 and testnet tb1, allow mixed-case per spec
  const bech32 = /\b(?:(?:bc1|tb1)[a-z0-9]{11,71})\b/gi;
  let m;
  while ((m = bech32.exec(text)) !== null) {
    addrs.add(m[0]);
  }
  // Base58 P2PKH/P2SH
  const base58 = /\b[13mn2][1-9A-HJ-NP-Za-km-z]{20,59}\b/g;
  while ((m = base58.exec(text)) !== null) {
    addrs.add(m[0]);
  }
  return Array.from(addrs);
}

function extractAddressesFromJson(json) {
  const results = new Set();
  const visit = (v) => {
    if (v == null) return;
    const t = typeof v;
    if (t === 'string') {
      const s = v;
      // reuse text extractor on a single string
      for (const a of extractAddresses(s)) results.add(a);
    } else if (Array.isArray(v)) {
      for (const it of v) visit(it);
    } else if (t === 'object') {
      for (const k of Object.keys(v)) visit(v[k]);
    }
  };
  visit(json);
  return Array.from(results);
}

function normalizeEntry(e) {
  // Keep only known fields and ensure null-safety
  const cardinal = e.cardinal_address ?? e.address ?? null;
  const ordinal = e.ordinal_address ?? null;
  const network = e.network ?? 'mainnet';
  const id = (() => {
    const key = `${network}|${cardinal ?? ''}|${ordinal ?? ''}`;
    try {
      return crypto.createHash('sha1').update(key).digest('hex');
    } catch (_) {
      // Fallback: timestamp-rand (non-deterministic)
      return String(e.id || e.address || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    }
  })();
  return {
    id,
    cardinal_address: cardinal,
    ordinal_address: ordinal,
    cardinal_pubkey: e.cardinal_pubkey ?? null,
    ordinal_pubkey: e.ordinal_pubkey ?? null,
    wallet: e.wallet ?? 'testing',
    network,
    connected: Boolean(e.connected ?? false),
    createdAt: e.createdAt ?? new Date().toISOString(),
    label: e.label ?? null,
    sourceUrl: e.sourceUrl ?? null,
  };
}

function loadSourceFiles() {
  if (!fs.existsSync(SOURCES_DIR)) return [];
  const files = fs.readdirSync(SOURCES_DIR).filter(f => f.endsWith('.json'));
  const all = [];
  for (const f of files) {
    if (f === 'urls.json') continue;
    const full = path.join(SOURCES_DIR, f);
    const json = readJsonSafe(full);
    if (!json) continue;
    const list = Array.isArray(json) ? json : (json.wallets || json.addresses || []);
    for (const e of list) {
      const entry = normalizeEntry(e);
      if (!entry.cardinal_address) continue;
      // Drop if network doesn't match likely prefix
      const addr = entry.cardinal_address;
      if (entry.network === 'mainnet' && !isLikelyMainnet(addr)) continue;
      if (entry.network === 'testnet' && !isLikelyTestnet(addr)) continue;
      all.push(entry);
    }
  }
  return all;
}

async function loadFromUrls() {
  const out = [];
  const cfg = readJsonSafe(URLS_FILE);
  if (!cfg) return out;
  const pushEntries = (addresses, network, labelBase, sourceUrl) => {
    for (const addr of addresses) {
      const entry = normalizeEntry({
        address: addr,
        network,
        label: `${labelBase}`,
        sourceUrl,
      });
      // validate by prefix again
      if (network === 'mainnet' && !isLikelyMainnet(entry.cardinal_address)) continue;
      if (network === 'testnet' && !isLikelyTestnet(entry.cardinal_address)) continue;
      out.push(entry);
    }
  };
  const tasks = [];
  const mainnetUrls = Array.isArray(cfg.mainnetUrls) ? cfg.mainnetUrls : [];
  const testnetUrls = Array.isArray(cfg.testnetUrls) ? cfg.testnetUrls : [];
  for (const u of mainnetUrls) {
    tasks.push(
      fetchUrl(u).then((html) => {
        const addrs = extractAddresses(html).filter(isLikelyMainnet);
        pushEntries(addrs, 'mainnet', new URL(u).hostname, u);
      })
    );
  }
  for (const u of testnetUrls) {
    tasks.push(
      fetchUrl(u).then((html) => {
        const addrs = extractAddresses(html).filter(isLikelyTestnet);
        pushEntries(addrs, 'testnet', new URL(u).hostname, u);
      })
    );
  }
  await Promise.allSettled(tasks);
  return out;
}

function dedupe(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = `${e.network}:${e.cardinal_address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function ensureCounts(entries, targetMainnet = 100, targetTestnet = 100) {
  const mainnet = entries.filter(e => e.network === 'mainnet');
  const testnet = entries.filter(e => e.network === 'testnet');
  if (mainnet.length < targetMainnet) {
    console.warn(`[warn] Only ${mainnet.length} mainnet addresses found (need ${targetMainnet}). Add more sources in scripts/sources/*.json`);
  }
  if (testnet.length < targetTestnet) {
    console.warn(`[warn] Only ${testnet.length} testnet addresses found (need ${targetTestnet}). Add more sources in scripts/sources/*.json`);
  }
  // Return truncated to target counts
  return [mainnet.slice(0, targetMainnet), testnet.slice(0, targetTestnet)];
}

function readExisting() {
  const existing = readJsonSafe(PUBLIC_FILE);
  if (existing && Array.isArray(existing.wallets)) return existing;
  return null;
}

function writeWallets(mainnet, testnet) {
  const combined = [...mainnet, ...testnet];
  const meta = {
    description: 'Publicly known Bitcoin addresses (testing only). Do not use in production.',
    fields: ['id','cardinal_address','ordinal_address','cardinal_pubkey','ordinal_pubkey','wallet','network','connected','createdAt','label','sourceUrl'],
    networks: { mainnet: mainnet.length, testnet: testnet.length },
    generatedAt: new Date().toISOString(),
  };
  const payload = {
    _meta: meta,
    wallets: combined,
  };
  fs.mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  fs.writeFileSync(PUBLIC_FILE, JSON.stringify(payload, null, 2));
  console.log(`[ok] Wrote ${combined.length} wallets to ${path.relative(process.cwd(), PUBLIC_FILE)} (mainnet ${mainnet.length}, testnet ${testnet.length})`);
}

function writeTxids(txids) {
  const outPath = path.join(ROOT, 'public', 'txids.json');
  const limited = Array.isArray(txids) ? txids.slice(0, 1000) : [];
  const payload = {
    _meta: {
      description: 'TXIDs extracted from sales.bson (testing only).',
      count: limited.length,
      generatedAt: new Date().toISOString(),
    },
    txids: limited,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`[ok] Wrote ${payload.txids.length} txids to ${path.relative(process.cwd(), outPath)}`);
}

async function main() {
  const dirArg = process.argv.find((a) => a.startsWith('--bsonDir='));
  const filesArg = process.argv.find((a) => a.startsWith('--bsonFiles='));
  const bsonDir = dirArg ? dirArg.split('=')[1] : null;
  // force default to only sales.bson; if user passes, still exclude txes.bson
  const requested = filesArg ? filesArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : ['sales.bson'];
  const bsonFiles = requested.filter((f) => f && f !== 'txes.bson');
  const localEntries = loadSourceFiles();
  const fetchedEntries = await loadFromUrls();
  const bsonEntries = loadFromBsonDir(bsonDir, bsonFiles);
  const entries = [...localEntries, ...fetchedEntries, ...bsonEntries];
  const deduped = dedupe(entries);
  const [mainnet, testnet] = ensureCounts(deduped, 100, 100);
  writeWallets(mainnet, testnet);
  // TXIDs output from sales.bson only
  const txids = loadTxidsFromSales(bsonDir);
  console.log(`[info] TXIDs extracted: ${Array.isArray(txids) ? txids.length : 0}`);
  writeTxids(Array.isArray(txids) ? txids : []);
}

if (require.main === module) {
  main();
}
