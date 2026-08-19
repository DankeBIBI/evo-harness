#!/usr/bin/env node
/**
 * 一键启动编排(dev.mjs)
 * - 同时拉起 Node 文件服务(file-server.mjs) + Vite dev server
 * - 先起 file-server 再起 vite,保证前端首次探测即命中 Node 服务(绕开浏览器授权)
 * - Ctrl+C / 任一进程退出 → 一并退出
 * 用法:npm run dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const children = [];

/** 启动子进程(stdio 直通终端) */
function start(name, script) {
  const child = spawn(node, [script], {
    cwd: __dirname,
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    console.log(`[dev] ${name} 已退出(code=${code}, signal=${signal})`);
    shutdown();
  });
  return child;
}

/** 停止全部子进程并退出 */
function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 1. 先起 Node 文件服务(端口 46112,以项目根为根)
start('file-server', 'file-server.mjs');
// 2. 稍候再起 Vite(端口 34115),保证前端探测命中
setTimeout(() => {
  start('vite', path.join('node_modules', 'vite', 'bin', 'vite.js'));
}, 300);
