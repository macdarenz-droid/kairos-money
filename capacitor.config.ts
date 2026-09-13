import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'app.kairos.money', appName: 'Kairos Money Tracker', webDir: 'dist',
  loggingBehavior: 'none',
  android: { backgroundColor: '#08090A', allowMixedContent: false, minWebViewVersion: 111 },
  server: { errorPath: 'webview-required.html' },
  ios: { scheme: 'Kairos Money Tracker', backgroundColor: '#08090A' },
  plugins: { CapacitorSQLite: { androidIsEncryption: true, iosIsEncryption: true, iosKeychainPrefix: 'app.kairos.money', androidBiometric: { biometricAuth: false }, iosBiometric: { biometricAuth: false } } },
};
export default config;
