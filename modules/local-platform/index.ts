import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeResult } from '../../src/domain/sharing';
import type { SourceScan } from '../../src/domain/lifecycle';
import type { ImportResult, ImportedPhoto } from '../../src/domain/inbox';
export type ReminderStatus = { enabled: boolean; permitted: boolean; hour: number; minute: number; nextAt: number | null; precision: string };
export type ManagedFile = { uri: string; kind: 'INBOX' | 'STAGING' | 'IMPORT_TEMP'; bytes: number; modifiedAt: number; active?: boolean };
export type ReminderContext = { token: string; serviceDate: string; basis: 'SCHEDULED_DATE' | 'DELIVERY_DATE' };
export type Fixture = { uri: string; label: string };
type Bridge = {
  connectSource(): Promise<SourceScan | null>;
  scanSource(): Promise<SourceScan | null>;
  importSource(sourceId: string, keys: string[]): Promise<{records: {entryKey: string; photo: ImportedPhoto}[]; skipped: number}>;
  disconnectSource(): Promise<void>;
  managedFiles(): Promise<ManagedFile[]>;
  deleteManagedFiles(uris: string[]): Promise<string[]>;
  pendingReminder(): Promise<ReminderContext | null>;
  acknowledgeReminder(token: string): Promise<void>;
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
