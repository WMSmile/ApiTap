import { getData, setData } from "./http";

const RAW_KEY = "store.rawkey";
const FLAG_KEY = "store.encrypt";
const PREFIX = "enc1:";

let enabled = false;

function toBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncryptionOn(): boolean {
  return enabled;
}

export async function initEncryption(): Promise<void> {
  try {
    const raw = await getData(FLAG_KEY);
    enabled = raw === "true";
  } catch {
    enabled = false;
  }
  if (enabled) await ensureKey();
}

async function ensureKey(): Promise<CryptoKey | null> {
  if (!enabled) return null;
  try {
    let b64 = await getData(RAW_KEY);
    if (!b64) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      b64 = toBase64(bytes);
      await setData(RAW_KEY, b64);
    }
    return crypto.subtle.importKey(
      "raw",
      fromBase64(b64),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (e) {
    console.warn("encryption key unavailable", e);
    return null;
  }
}

export async function setEncryption(on: boolean): Promise<boolean> {
  enabled = on;
  await setData(FLAG_KEY, on ? "true" : "false");
  if (on) await ensureKey();
  return enabled;
}

export async function encryptIfNeeded(text: string): Promise<string> {
  const key = await ensureKey();
  if (!key) return text;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(text);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return PREFIX + toBase64(iv) + ":" + toBase64(new Uint8Array(cipher));
  } catch (e) {
    console.warn("encrypt failed, storing plain text", e);
    return text;
  }
}

export async function decryptIfNeeded(raw: string): Promise<string> {
  if (!raw.startsWith(PREFIX)) return raw;
  const key = await ensureKey();
  if (!key) return raw;
  try {
    const parts = raw.split(":");
    const iv = fromBase64(parts[2]);
    const data = fromBase64(parts[3]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch (e) {
    console.warn("decrypt failed", e);
    return raw;
  }
}
