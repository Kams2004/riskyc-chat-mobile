import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';

type AttachmentSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPickPhotos: () => void;
  onPickCamera: () => void;
  onPickDocument: () => void;
};

/** The `+` composer button's menu — a plain bottom-sheet modal, no library needed. */
export function AttachmentSheet({ visible, onClose, onPickPhotos, onPickCamera, onPickDocument }: AttachmentSheetProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { t } = useTranslation('media');

  function choose(action: () => void) {
    onClose();
    action();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.row}>
          <SheetOption
            label={t('attachmentSheet.photos')}
            color={colors.brand500}
            onPress={() => choose(onPickPhotos)}
            icon={
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Rect x={3} y={3} width={18} height={18} rx={2} />
                <Path d="M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
                <Path d="M21 15l-5-5L5 21" />
              </Svg>
            }
          />
          <SheetOption
            label={t('attachmentSheet.camera')}
            color={colors.gold500}
            onPress={() => choose(onPickCamera)}
            icon={
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </Svg>
            }
          />
          <SheetOption
            label={t('attachmentSheet.document')}
            color={colors.brand700}
            onPress={() => choose(onPickDocument)}
            icon={
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <Path d="M14 2v6h6" />
              </Svg>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function SheetOption({ label, color, icon, onPress }: { label: string; color: string; icon: React.ReactNode; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={optionStyles.option} onPress={onPress}>
      <View style={[optionStyles.iconCircle, { backgroundColor: color }]}>{icon}</View>
      <Text style={[optionStyles.label, { color: colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const optionStyles = StyleSheet.create({
  option: { alignItems: 'center', gap: 8, width: 84 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.sans, fontSize: 12.5 },
});

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingVertical: 24,
      paddingHorizontal: 20,
    },
    row: { flexDirection: 'row', justifyContent: 'space-around' },
  });
}
