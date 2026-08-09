import { Platform } from 'react-native';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// Minimal cross-platform key/value store for app preferences.
// Web persists to localStorage; native persists to a dedicated SQLite database.

const WEB_STORE_KEY = 'npm-user-tracker:prefs';
const PREF_DB_NAME = 'npm-user-tracker-prefs.db';

let database: SQLiteDatabase | null = null;

function nativeDb(): SQLiteDatabase | null {
  if (Platform.OS === 'web') return null;
  if (!database) {
    database = openDatabaseSync(PREF_DB_NAME);
    database.execSync(
      'CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY NOT NULL, value TEXT)',
    );
  }
  return database;
}

function webStore(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function webWrite(mutate: (store: Record<string, string>) => void): void {
  try {
    const store = webStore();
    mutate(store);
    if (Object.keys(store).length === 0) {
      globalThis.localStorage?.removeItem(WEB_STORE_KEY);
    } else {
      globalThis.localStorage?.setItem(WEB_STORE_KEY, JSON.stringify(store));
    }
  } catch {
    // Storage unavailable (private mode, etc.) — the preference just won't persist.
  }
}

export function getPref(key: string): string | null {
  const db = nativeDb();
  if (!db) return webStore()[key] ?? null;
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM prefs WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export function setPref(key: string, value: string | null): void {
  const db = nativeDb();
  if (!db) {
    webWrite((store) => {
      if (value === null) delete store[key];
      else store[key] = value;
    });
    return;
  }
  if (value === null) {
    db.runSync('DELETE FROM prefs WHERE key = ?', key);
  } else {
    db.runSync('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)', key, value);
  }
}