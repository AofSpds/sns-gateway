import { PermissionsAndroid, Platform } from 'react-native';
import { platformBridge } from '../../modules/local-platform';
import { validateTime } from '../domain/planning';
export async function configureReminder(enabled: boolean, hour: number, minute: number) {
  validateTime(hour, minute);
  if (enabled && Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  // Only the native OS request/readback is shown as a registered reminder.
  return platformBridge().setReminder(enabled, hour, minute);
}
