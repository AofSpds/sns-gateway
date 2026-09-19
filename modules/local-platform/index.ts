import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeResult } from '../../src/domain/sharing';
import type { ImportResult, ImportedPhoto } from '../../src/domain/inbox';
export type ReminderStatus = { enabled: boolean; permitted: boolean; hour: number; minute: number; nextAt: number | null; precision: string };
export type Fixture = { uri: string; label: string };
type Bridge = {
  pickPhotos(): Promise<ImportResult>;
  inventoryPhotos(): Promise<ImportedPhoto[]>;
  stagePhotos(uris: string[]): Promise<string[]>;
  reminderStatus(): Promise<ReminderStatus>;
  setReminder(enabled: boolean, hour: number, minute: number): Promise<ReminderStatus>;
  testReminder(): Promise<void>;
  storageDirectory(): Promise<string>;
  makeFixtures(count: number): Promise<Fixture[]>;
  shareFiles(uris: string[], caption: string): Promise<NativeResult>;
  copyCaption(caption: string): Promise<void>;
};
export function platformBridge(): Bridge {
  const native = requireOptionalNativeModule<Bridge>('LocalPlatform');
  if (!native) throw new Error('NATIVE_BUILD_REQUIRED');
  return native;
}
