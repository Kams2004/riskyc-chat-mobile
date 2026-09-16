import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';

type ActionRowProps = {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  danger?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

/** Generic icon-circle + label row — extracted for reuse across contact-details, group-info, and settings-style screens (none existed as a shared component before). */
export function ActionRow({ icon, label, subtitle, danger, onPress, disabled }: ActionRowProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={disabled || !onPress}>
      <View style={[styles.iconCircle, danger && { backgroundColor: colors.tint2 }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, danger && { color: colors.brand700 }]}>{label}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 4 },
    iconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.tint1, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    subtitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  });
}
