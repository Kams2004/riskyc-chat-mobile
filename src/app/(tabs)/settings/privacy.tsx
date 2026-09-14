import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { preferences } from '../../../lib/preferences';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  colors,
  styles,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.hairline, true: colors.brand400 }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const [sendReadReceipts, setSendReadReceiptsState] = useState(preferences.isSendReadReceipts());
  const [showOnlineStatus, setShowOnlineStatusState] = useState(preferences.isShowOnlineStatus());

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <ToggleRow
          title="Read receipts"
          description="Let people see when you've read their messages. Turning this off also stops sending them for messages you receive."
          value={sendReadReceipts}
          onValueChange={(value) => {
            setSendReadReceiptsState(value);
            preferences.setSendReadReceipts(value);
          }}
          colors={colors}
          styles={styles}
        />
        <View style={styles.divider} />
        <ToggleRow
          title="Show online status"
          description="Let people see when you're online. You can still see when others are online either way."
          value={showOnlineStatus}
          onValueChange={(value) => {
            setShowOnlineStatusState(value);
            preferences.setShowOnlineStatus(value);
          }}
          colors={colors}
          styles={styles}
        />
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    card: { backgroundColor: colors.tint1, borderRadius: 16, paddingHorizontal: 18 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
    rowTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textPrimary },
    rowDescription: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17, color: colors.textMuted, marginTop: 3 },
    divider: { height: 1, backgroundColor: colors.hairline },
  });
}
