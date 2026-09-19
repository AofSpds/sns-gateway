import type { ExpoConfig } from 'expo/config';
const developmentNetwork = process.env.SNSG_DEVELOPMENT_NETWORK === '1';
const config: ExpoConfig = {
  name: 'SNS Gateway', slug: 'sns-gateway', version: '0.1.0',
  orientation: 'portrait', userInterfaceStyle: 'light',
  platforms: ['ios', 'android'],
  ios: { bundleIdentifier: 'com.aofspds.snsgateway', supportsTablet: true,
    infoPlist: { NSPhotoLibraryUsageDescription: '선택한 사진의 기기 내부 사본을 게시함에 준비합니다. 사진을 서버에 올리지 않습니다.', UIFileSharingEnabled: false, LSSupportsOpeningDocumentsInPlace: false } },
  android: { package: 'com.aofspds.snsgateway', allowBackup: false,
    blockedPermissions: [
      'android.permission.RECORD_AUDIO', 'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
      ...(developmentNetwork ? [] : ['android.permission.INTERNET']),
    ] },
  updates: { enabled: false },
  plugins: ['./plugins/withLocalPrivacy.cjs'],
  extra: { productMode: 'LOCAL_INBOX_REMINDER_CANDIDATE', httpApiEnabled: false, developmentNetwork },
};
export default config;
