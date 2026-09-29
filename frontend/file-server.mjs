#!/usr/bin/env node
/**
 * 本地 Node 文件服务(file-server.mjs)
 * - 零依赖:仅用 node:http / node:fs / node:path / node:os / node:url
 * - 前端浏览器通过 HTTP 调本服务读写本地文件,彻底绕开 File System Access API 的会话授权
 * - 默认以本项目根为根目录,重启不丢、无需授权
 * - 用法:node file-server.mjs [--port 46112] [--root /path/to/root]
 * - 安全:仅绑定 127.0.0.1;所有路径 resolve 后校验必须在根目录内,防路径穿越
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// file-server.mjs 位于 frontend/,项目根为其父目录
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---- CLI 参数 ----
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const PORT = Number(arg('--port') ?? process.env.FILE_SERVER_PORT ?? 46112);
const CLI_ROOT = arg('--root');

// ---- 根目录持久化(切换根时写入,重启自动加载) ----
const STATE_DIR = path.join(os.homedir(), '.evo-harness');
const STATE_FILE = path.join(STATE_DIR, 'file-server-root.json');

/** 当前根目录 */
let root = PROJECT_ROOT;

/** 受信任的额外根(只读),用于 ~/.claude 等固定路径。 */
const TRUSTED_EXTRA_ROOTS = [
  // 用户家目录下的 .claude(Windows/macOS/Linux 都用 os.homedir() 解析)
  path.join(os.homedir(), '.claude'),
];

function loadRoot() {
  if (CLI_ROOT) {
    root = path.resolve(CLI_ROOT);
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (data?.root && fs.existsSync(data.root)) root = data.root;
  } catch {
    /* 默认项目根 */
  }
}

function persistRoot(nextRoot) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ root: nextRoot }, null, 2), 'utf8');
  root = nextRoot;
}

/**
 * 把"@trusted"或普通相对路径解析为绝对路径。
 *   - 路径以 "@trusted/<key>/..." 开头时,匹配 TRUSTED_EXTRA_ROOTS 之一
 *   - 否则按项目根解析
 * 越界抛 403。
 */
function safeResolve(relPath) {
  const rel = String(relPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.startsWith('@trusted/')) {
    const rest = rel.slice('@trusted/'.length);
    const slash = rest.indexOf('/');
    const key = slash >= 0 ? rest.slice(0, slash) : rest;
    const tail = slash >= 0 ? rest.slice(slash + 1) : '';
    const trustedRoot = TRUSTED_EXTRA_ROOTS[Number(key)] ?? TRUSTED_EXTRA_ROOTS[key];
    if (!trustedRoot) {
      const err = new Error(`未知的受信任根: @trusted/${key}`);
      err.status = 404;
      throw err;
    }
    const abs = path.resolve(trustedRoot, tail);
    return abs;
  }
  const abs = path.resolve(root, rel);
  const relToRoot = path.relative(root, abs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    const err = new Error(`路径越出根目录: ${relPath}`);
    err.status = 403;
    throw err;
  }
  return abs;
}

/** 单层目录列表 → FileInfo[] */
function listDir(relPath) {
  const abs = safeResolve(relPath);
  const st = fs.statSync(abs);
  if (!st.isDirectory()) {
    const e = new Error(`Not a directory: ${relPath}`);
    e.status = 400;
    throw e;
  }
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childPath = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push({ isDir: true, name: entry.name, path: childPath, size: 0 });
    } else {
      try {
        const childSt = fs.statSync(path.join(abs, entry.name));
        out.push({
          isDir: false,
          modifiedAt: childSt.mtimeMs,
          name: entry.name,
          path: childPath,
          size: childSt.size,
        });
      } catch {
        /* 跳过读不到的条目 */
      }
    }
  }
  return out;
}

/** 递归搜索文件名(最多 10 层,防爆栈) */
function searchDir(q, max) {
  const kw = String(q ?? '').toLowerCase();
  if (!kw) return [];
  const hits = [];
  const walk = (relPath, depth) => {
    if (depth > 10 || hits.length >= max) return;
    let entries;
    try {
      entries = fs.readdirSync(safeResolve(relPath), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= max) return;
      const childPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(childPath, depth + 1);
      } else if (entry.name.toLowerCase().includes(kw)) {
        try {
          const st = fs.statSync(path.join(root, childPath));
          hits.push({
            isDir: false,
            modifiedAt: st.mtimeMs,
            name: entry.name,
            path: childPath,
            size: st.size,
          });
        } catch {
          /* 跳过 */
        }
      }
    }
  };
  walk('', 0);
  return hits.slice(0, max);
}

// ---- HTTP ----
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...CORS,
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/health') {
      send(res, 200, {
        extraRoots: TRUSTED_EXTRA_ROOTS.map((p) => ({
          name: path.basename(p),
          path: p,
        })),
        ok: true,
        root,
        rootName: path.basename(root),
      });
      return;
    }
    if (req.method === 'GET' && p === '/api/list') {
      send(res, 200, { items: listDir(url.searchParams.get('path') ?? '') });
      return;
    }
    if (req.method === 'GET' && p === '/api/read') {
      const abs = safeResolve(url.searchParams.get('path') ?? '');
      const st = fs.statSync(abs);
      if (!st.isFile()) {
        const e = new Error('Not a file');
        e.status = 400;
        throw e;
      }
      send(res, 200, { content: fs.readFileSync(abs, 'utf8') });
      return;
    }
    if (req.method === 'GET' && p === '/api/readRange') {
      const abs = safeResolve(url.searchParams.get('path') ?? '');
      const st = fs.statSync(abs);
      if (!st.isFile()) {
        const e = new Error('Not a file');
        e.status = 400;
        throw e;
      }
      const raw = fs.readFileSync(abs, 'utf8');
      const lines = raw === '' ? [] : raw.replace(/\r?\n$/, '').split(/\r?\n/);
      const totalLines = lines.length;
      const startLine = Math.max(1, Number(url.searchParams.get('startLine')) || 1);
      const rawEnd = Number(url.searchParams.get('endLine')) || startLine + 99;
      const endLine = Math.max(startLine, Math.min(totalLines, rawEnd));
      send(res, 200, {
        content: lines.slice(startLine - 1, endLine).join('\n'),
        endLine,
        startLine,
        totalLines,
      });
      return;
    }
    if (req.method === 'POST' && p === '/api/write') {
      const body = await readJson(req);
      const abs = safeResolve(body.path ?? '');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, String(body.content ?? ''), 'utf8');
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && p === '/api/delete') {
      const body = await readJson(req);
      const abs = safeResolve(body.path ?? '');
      fs.rmSync(abs, { force: true });
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && p === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      const max = Number(url.searchParams.get('max')) || 50;
      send(res, 200, { items: searchDir(q, max) });
      return;
    }
    if (req.method === 'POST' && p === '/api/root') {
      const body = await readJson(req);
      const nextRoot = path.resolve(String(body.root ?? ''));
      if (!fs.existsSync(nextRoot) || !fs.statSync(nextRoot).isDirectory()) {
        const e = new Error(`无效目录: ${body.root}`);
        e.status = 400;
        throw e;
      }
      persistRoot(nextRoot);
      send(res, 200, { ok: true, root: nextRoot, rootName: path.basename(nextRoot) });
      return;
    }
    send(res, 404, { error: `Not found: ${p}` });
  } catch (err) {
    send(res, err.status || 500, { error: err.message });
  }
});

loadRoot();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[file-server] listening http://127.0.0.1:${PORT}`);
  console.log(`[file-server] root = ${root}`);
});
