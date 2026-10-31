import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * API keys and tokens are encrypted with the OS keychain (macOS Keychain / Windows DPAPI via
 * Electron safeStorage) and never written in plain text or to SQLite.
 */
type Store = Record<string, string>; // name → base64 ciphertext

const file = () => join(app.getPath('userData'), 'secrets.bin.json');

function read(): Store {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Store) : {};
  } catch {
    return {};
  }
}

export function secureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setSecret(name: string, value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage (OS keychain) is not available on this computer.');
  const s = read();
  s[name] = safeStorage.encryptString(value).toString('base64');
  writeFileSync(file(), JSON.stringify(s), { mode: 0o600 });
}

export function getSecret(name: string): string | undefined {
  const v = read()[name];
  if (!v || !safeStorage.isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(v, 'base64'));
  } catch {
    return undefined;
  }
}

export function deleteSecret(name: string) {
  const s = read();
  delete s[name];
  writeFileSync(file(), JSON.stringify(s), { mode: 0o600 });
}

/** Only the last 4 characters are ever shown. */
export function hint(value: string | undefined) {
  return value ? `…${value.slice(-4)}` : undefined;
}
