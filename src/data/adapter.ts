import type { Database } from './types';
import { migrate } from './seed';

/**
 * Everything the app needs from storage. The local file adapter is what runs
 * today; the Supabase adapter added in the cloud phase implements the same
 * three methods plus live `subscribe`, so no screen has to change.
 */
export interface StorageAdapter {
  kind: 'local' | 'cloud';
  label: string;
  load(): Promise<Database | null>;
  save(db: Database): Promise<void>;
  subscribe?(onRemoteChange: (db: Database) => void): () => void;
}

/** The bridge the Electron preload exposes. Absent when running in a browser. */
export interface SbhBridge {
  isDesktop: true;
  data: { read(): Promise<Database | null>; write(db: Database): Promise<boolean> };
  config: { read(): Promise<Record<string, unknown>>; write(v: Record<string, unknown>): Promise<boolean> };
  pin: {
    status(): Promise<{ set: boolean; supported: boolean }>;
    set(pin: string): Promise<boolean>;
    verify(pin: string): Promise<boolean>;
    clear(): Promise<boolean>;
  };
  backup: {
    export(db: Database): Promise<{ ok: boolean; path?: string }>;
    import(): Promise<{ ok: boolean; data?: Database; path?: string; error?: string }>;
    reveal(): Promise<boolean>;
  };
  excel: {
    save(spec: unknown): Promise<{ ok: boolean; path?: string; error?: string }>;
    autoSave(spec: unknown, folder: string): Promise<{ ok: boolean; path?: string; at?: string; error?: string }>;
    chooseFolder(): Promise<{ ok: boolean; folder?: string }>;
  };
  print: {
    pdf(html: string, suggestedName?: string): Promise<{ ok: boolean; path?: string }>;
    paper(html: string): Promise<{ ok: boolean }>;
  };
  openExternal(url: string): Promise<boolean>;
  appInfo(): Promise<{ version: string; dataPath: string; backupPath: string; platform: string }>;
}

declare global {
  interface Window {
    sbh?: SbhBridge;
  }
}

export const bridge = (): SbhBridge | undefined =>
  typeof window !== 'undefined' ? window.sbh : undefined;

export const isDesktop = () => !!bridge();

const WEB_KEY = 'sbh-data-v1';

/**
 * Data on this machine: a JSON file in the app's own folder under Electron,
 * or localStorage when the UI is being run in a plain browser for development.
 */
export class LocalAdapter implements StorageAdapter {
  kind = 'local' as const;
  label = 'This computer';

  async load(): Promise<Database | null> {
    const api = bridge();
    if (api) {
      const raw = await api.data.read();
      return raw ? migrate(raw) : null;
    }
    const raw = localStorage.getItem(WEB_KEY);
    return raw ? migrate(JSON.parse(raw) as Database) : null;
  }

  async save(db: Database): Promise<void> {
    const api = bridge();
    if (api) {
      await api.data.write(db);
      return;
    }
    localStorage.setItem(WEB_KEY, JSON.stringify(db));
  }
}

/** Opens WhatsApp / the phone dialer through the OS rather than in-app. */
export async function openExternal(url: string): Promise<void> {
  const api = bridge();
  if (api) {
    await api.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
