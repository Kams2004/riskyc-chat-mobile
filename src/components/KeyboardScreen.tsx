import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Expo Go ignores app.json's android.softwareKeyboardLayoutMode (it only
 * takes effect in a custom prebuilt/dev-client build, since Expo Go is one
 * shared APK), so on Android the keyboard just overlays the screen there
 * unless we shrink the layout ourselves — hence 'height' behavior below,
 * which works in both Expo Go and a real build.
 */
export function KeyboardScreen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {children}
    </KeyboardAvoidingView>
  );
}
