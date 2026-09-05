const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getStorageKey(): Promise<CryptoKey | null> {
  if (
    typeof window === 'undefined'
    || typeof crypto === 'undefined'
    || !crypto.subtle
  ) {
    return null;
  }
  const source = encoder.encode(`second-solution-studio-session-v1:${window.location.origin}`);
  const digest = await crypto.subtle.digest('SHA-256', source);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function saveEncryptedJson<T>(key: string, value: T) {
  try {
    const cryptoKey = await getStorageKey();
    if (!cryptoKey) return false;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = encoder.encode(JSON.stringify(value));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, payload);
    window.localStorage.setItem(key, `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`);
    return true;
  } catch {
    return false;
  }
}

export async function loadEncryptedJson<T>(key: string): Promise<T | null> {
  try {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const [ivValue, payloadValue] = stored.split('.');
    if (!ivValue || !payloadValue) return null;
    const cryptoKey = await getStorageKey();
    if (!cryptoKey) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivValue) },
      cryptoKey,
      base64ToBytes(payloadValue),
    );
    return JSON.parse(decoder.decode(decrypted)) as T;
  } catch {
    return null;
  }
}

export function clearStoredSession(key: string) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.localStorage.removeItem('second-solution-history');
    window.localStorage.removeItem('mae-history');
    window.localStorage.removeItem('second-solution-feedback');
    window.localStorage.removeItem('second-solution-theme');
  } catch {
    // Storage is optional; the in-memory studio remains usable.
  }
}
