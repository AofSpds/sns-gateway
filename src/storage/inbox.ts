import { database } from './history';
import { ACTIVE_INBOX_QUERY } from './migration3';
import { validateImportedPhoto, type ImportedPhoto } from '../domain/inbox';
import type { ProviderId } from '../gateway/providers';
export type AssetRow = ImportedPhoto & { registered_at: number | null; basis: 'APP_REGISTERED' | 'FIRST_OBSERVED'; already_shared: number };
export async function registerPhotos(photos: ImportedPhoto[], recovered = false): Promise<number> {
  photos.forEach(validateImportedPhoto);
  const db = await database();
  let added = 0;
  await db.withExclusiveTransactionAsync(async transaction => {
    // Registration is the successful local DB operation, never the capture date.
    const registered = recovered ? null : Date.now();
    for (const photo of photos) {
      const result = await transaction.runAsync('INSERT OR IGNORE INTO inbox_assets VALUES (?,?,?,?,?,?,?)', photo.id, photo.uri, photo.bytes, photo.width, photo.height, registered, recovered ? 'FIRST_OBSERVED' : 'APP_REGISTERED');
      added += result.changes;
    }
  });
  return added;
}
export async function listAssets(provider: ProviderId): Promise<AssetRow[]> {
  return (await database()).getAllAsync<AssetRow>(ACTIVE_INBOX_QUERY, provider);
}
export async function saveCaption(caption: string): Promise<void> {
  if (caption.length > 2200 || caption.includes('\0')) throw new Error('INVALID_CAPTION');
  await (await database()).runAsync("INSERT INTO local_settings VALUES ('caption',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", caption);
}
export async function loadCaption(): Promise<string> {
  return (await (await database()).getFirstAsync<{value: string}>("SELECT value FROM local_settings WHERE key='caption'"))?.value ?? '오늘의 기록입니다.';
}
