/**
 * 安全存储:封装 localStorage + AES-GCM 加密
 * - 主密钥存 localStorage 的 wais.master.v1(base64)
 * - 加密字段存 localStorage 的 wais.enc.<key>
 * - 明文字段直接存 wais.plain.<key>
 */

import { decrypt, encrypt, generateMasterKey } from '../crypto/aes-gcm';

const MASTER_KEY_STORAGE = 'wais.master.v1';
const ENC_PREFIX = 'wais.enc.';
const PLAIN_PREFIX = 'wais.plain.';

/** 获取或创建主密钥(返回 Uint8Array) */
export function getMasterKey(): Uint8Array {
  const stored = localStorage.getItem(MASTER_KEY_STORAGE);
  if (stored) {
    return base64ToBytes(stored);
  }
  const fresh = generateMasterKey();
  localStorage.setItem(MASTER_KEY_STORAGE, bytesToBase64(fresh));
  return fresh;
}

/** 重置主密钥(慎用,会导致旧加密数据无法解密) */
export function resetMasterKey(): Uint8Array {
  localStorage.removeItem(MASTER_KEY_STORAGE);
  return getMasterKey();
}

/** 加密写入 */
export async function setEncrypted(key: string, value: string): Promise<void> {
  const rawKey = getMasterKey();
  const cipher = await encrypt(value, rawKey);
  localStorage.setItem(ENC_PREFIX + key, cipher);
}

/** 加密读取 */
export async function getEncrypted(key: string): Promise<null | string> {
  const cipher = localStorage.getItem(ENC_PREFIX + key);
  if (!cipher) return null;
  const rawKey = getMasterKey();
  try {
    return await decrypt(cipher, rawKey);
  } catch {
    // 主密钥不匹配或数据损坏,清掉
    localStorage.removeItem(ENC_PREFIX + key);
    return null;
  }
}

/** 加密字段是否存在 */
export function hasEncrypted(key: string): boolean {
  return localStorage.getItem(ENC_PREFIX + key) !== null;
}

/** 明文写入 */
export function setPlain(key: string, value: string): void {
  localStorage.setItem(PLAIN_PREFIX + key, value);
}

/** 明文读取 */
export function getPlain(key: string): null | string {
  return localStorage.getItem(PLAIN_PREFIX + key);
}

/** 通用读取(优先明文,再加密) */
export async function getSmart(key: string): Promise<null | string> {
  return getPlain(key) ?? (await getEncrypted(key));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}