import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';

export type OverflowMenuItem = {
  label: string;
  onPress: () => void;
  danger?: boolean;
};

type ChatOverflowMenuProps = {
  visible: boolean;
  onClose: () => void;
  items: OverflowMenuItem[];
};

/** Vertical bottom-sheet action list — the chat header's ⋮ menu, same modal shape as AttachmentSheet but a list instead of a horizontal row (too many items to fit that way). */
export function ChatOverflowMenu({ visible, onClose, items }: ChatOverflowMenuProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

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
        {items.map((item, i) => (
          <TouchableOpacity key={i} style={styles.row} onPress={() => choose(item.onPress)}>
            <Text style={[styles.label, item.danger && { color: colors.brand700 }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 8,
      paddingBottom: 24,
    },
    row: { paddingVertical: 14, paddingHorizontal: 16 },
    label: { fontFamily: fonts.sansMedium, fontSize: 15.5, color: colors.textPrimary },
  });
}
