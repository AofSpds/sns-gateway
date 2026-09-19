import { AppState } from 'react-native';
import { platformBridge } from '../../modules/local-platform';
import { SingleFlight, captionText, validateLocalUris } from '../domain/sharing';
import type { ProviderId } from '../gateway/providers';
import { recordRequest, recordNativeResult, recordError } from '../storage/history';
const flight = new SingleFlight();
export async function shareFixtures(provider: ProviderId, uris: string[], caption: string, assetIds?: string[]) {
  return flight.run(async () => {
    if (AppState.currentState !== 'active') throw new Error('FOREGROUND_REQUIRED');
    validateLocalUris(uris);
    captionText(caption);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Persist before handing off: losing a callback must not imply failure or repost.
    // Immutable copies remain available while the receiving app reads them.
    const staged = assetIds ? await platformBridge().stagePhotos(uris) : uris;
    await recordRequest(id, provider, staged, caption, assetIds);
    let result;
    try { result = await platformBridge().shareFiles(staged, caption); }
    catch {
      await recordError(id).catch(() => undefined);
      throw new Error('SHARE_UNCONFIRMED');
    }
    // A failure to save the OS callback preserves the pending row for restart recovery.
    await recordNativeResult(id, result);
    return result;
  });
}
