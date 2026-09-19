import type { ExpoConfig } from 'expo/config';
const developmentNetwork = process.env.SNSG_DEVELOPMENT_NETWORK === '1';
const config: ExpoConfig = {
  name: 'SNS Gateway', slug: 'sns-gateway', version: '0.1.0',
  orientation: 'portrait', userInterfaceStyle: 'light',
  platforms: ['ios', 'android'],
  ios: { bundleIdentifier: 'com.aofspds.snsgateway', supportsTablet: true,
    infoPlist: { UIFileSharingEnabled: false, LSSupportsOpeningDocumentsInPlace: false } },
  android: { package: 'com.aofspds.snsgateway', allowBackup: false,
    blockedPermissions: [
      'android.permission.RECORD_AUDIO', 'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
      ...(developmentNetwork ? [] : ['android.permission.INTERNET']),
    ] },
  updates: { enabled: false },
  plugins: ['./plugins/withLocalPrivacy.cjs'],
  extra: { productMode: 'LOCAL_SHARE_SPIKE', httpApiEnabled: false, developmentNetwork },
};
export default config;
