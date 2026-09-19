import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeResult } from '../../src/domain/sharing';
export type Fixture = { uri: string; label: string };
type Bridge = {
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
