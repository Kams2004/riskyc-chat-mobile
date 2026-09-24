import { Linking, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { type UpdatePromptState } from '../features/appVersion/useAppVersionCheck';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts, gradients, type Palette } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';

type UpdatePromptModalProps = {
  state: UpdatePromptState;
  onDismiss: () => void;
};

/**
 * "required" (below the configured minimum-supported version) has no close
 * button and doesn't dismiss on backdrop tap — the app is genuinely too old
 * to keep using safely (e.g. an API contract change). "available" is a
 * plain dismissible nudge, closable via "Later" or the backdrop.
 */
export function UpdatePromptModal({ state, onDismiss }: UpdatePromptModalProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (!state) return null;
  const isRequired = state.kind === 'required';

  function handleUpdate() {
    Linking.openURL(state!.playStoreUrl).catch(() => {});
  }

  const content = (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 3v13m0 0l-4-4m4 4l4-4M5 21h14" />
        </Svg>
      </View>
      <Text style={styles.title}>{isRequired ? 'Update required' : 'Update available'}</Text>
      <Text style={styles.body}>
        {isRequired
          ? 'A new version of RiskyC Chat is required to keep using the app.'
          : 'A new version of RiskyC Chat is available with the latest improvements.'}
      </Text>
      <LinearGradient colors={gradients.gold} style={styles.updateButton}>
        <TouchableOpacity onPress={handleUpdate} style={styles.updateTouchable}>
          <Text style={styles.updateText}>Update now</Text>
        </TouchableOpacity>
      </LinearGradient>
      {!isRequired && (
        <TouchableOpacity onPress={onDismiss} style={styles.laterTouchable}>
          <Text style={styles.laterText}>Later</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={isRequired ? undefined : onDismiss}>
      {isRequired ? (
        <View style={styles.backdrop}>{content}</View>
      ) : (
        <TouchableWithoutFeedback onPress={onDismiss}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>{content}</TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: 'center' },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.brand500,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.textPrimary, marginBottom: 6 },
    body: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
    updateButton: { width: '100%', borderRadius: 999 },
    updateTouchable: { paddingVertical: 13, alignItems: 'center' },
    updateText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#ffffff' },
    laterTouchable: { marginTop: 12, paddingVertical: 6 },
    laterText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
  });
}
