/**
 * AES-GCM 加密原语
 * - 用于本地持久化敏感字段(API Key 等)
 * - 主密钥由 secure-storage 持有,本文件只负责加解密
 * - IV 每次加密随机生成,严禁复用
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits, GCM 推荐)

/** 派生 CryptoKey(从原始字节) */
async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  // 把 Uint8Array 包装成独立 ArrayBuffer,避开 SharedArrayBuffer 类型冲突
  const buf = new ArrayBuffer(rawKey.byteLength);
  new Uint8Array(buf).set(rawKey);
  return crypto.subtle.importKey('raw', buf, ALGORITHM, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * 加密明文,返回 iv || ciphertext 的 base64 字符串
 * 格式:[12 bytes IV][N bytes ciphertext]
 */
export async function encrypt(plain: string, rawKey: Uint8Array): Promise<string> {
  const key = await importKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt(
    { iv, name: ALGORITHM },
    key,
    encoded,
  );
  const cipherBytes = new Uint8Array(cipherBuf);
  const merged = new Uint8Array(iv.length + cipherBytes.length);
  merged.set(iv, 0);
  merged.set(cipherBytes, iv.length);
  return base64Encode(merged);
}

/**
 * 解密 iv || ciphertext 格式的 base64 字符串
 */
export async function decrypt(payload: string, rawKey: Uint8Array): Promise<string> {
  const merged = base64Decode(payload);
  if (merged.length <= IV_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }
  const iv = merged.slice(0, IV_LENGTH);
  const cipherBytes = merged.slice(IV_LENGTH);
  const key = await importKey(rawKey);
  const plainBuf = await crypto.subtle.decrypt(
    { iv, name: ALGORITHM },
    key,
    cipherBytes,
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * 生成新的主密钥(32 字节随机)
 * 首次安装时调用一次,存到 secure-storage
 */
export function generateMasterKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_LENGTH / 8));
}

/** Uint8Array → base64 */
function base64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/** base64 → Uint8Array */
function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}