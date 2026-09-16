import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Human-readable label for the "logged-in devices" screen — display-only, never trusted for anything security-relevant (see AuthController.OtpVerifyRequest). */
export function currentDeviceLabel(): string {
  const model = Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android device');
  return model;
}
