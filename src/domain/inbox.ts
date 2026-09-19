import { validateLocalUris } from './sharing.ts';
export type ImportedPhoto = { id: string; uri: string; bytes: number; width: number; height: number };
export type ImportResult = { photos: ImportedPhoto[]; skipped: number };
export function validateImportedPhoto(photo: ImportedPhoto): void {
  if (!/^[a-f0-9]{64}$/.test(photo.id)) throw new Error('INVALID_PHOTO_HASH');
  validateLocalUris([photo.uri]);
  if (!new URL(photo.uri).pathname.endsWith('/' + photo.id + '.jpg')) throw new Error('INVALID_PHOTO_PATH');
  if (!Number.isSafeInteger(photo.bytes) || photo.bytes < 3 || photo.bytes > 10_485_760) throw new Error('INVALID_PHOTO_SIZE');
  if (![photo.width, photo.height].every(n => Number.isInteger(n) && n > 0 && n <= 2048)) throw new Error('INVALID_PHOTO_DIMENSIONS');
}
export function selectIds(ids: string[]): string[] {
  if (!ids.length || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('INVALID_PHOTO_SELECTION');
  return [...ids];
}
export function movePhoto(ids: string[], index: number, delta: -1 | 1): string[] {
  const result = [...ids];
  const target = index + delta;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return result;
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
