import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../../../features/auth/AuthContext';
import { useTheme } from '../../../features/theme/ThemeContext';
import { deleteMyAccount, getUser } from '../../../features/users/api';
import { maskIdentifier } from '../../../lib/mask';
import { fonts, type Palette } from '../../../theme';

export default function AccountScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId, signOut } = useAuth();
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getUser(userId)
      .then((user) => setIdentifier(user.email ?? user.phoneNumber))
      .catch(() => {});
  }, [userId]);

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      "This removes your account and profile permanently. Your existing messages stay visible to people you've chatted with, but you won't be reachable or discoverable anymore. This cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteMyAccount();
              await signOut();
            } catch (e) {
              console.warn('[Account] delete failed', e);
              Alert.alert('Could not delete account', 'Please check your connection and try again.');
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 40 }} />
      </View>

      <TouchableOpacity style={styles.card} onPress={() => setIsRevealed((prev) => !prev)} activeOpacity={0.7}>
        <Text style={styles.label}>Registered with</Text>
        <Text style={styles.value}>{identifier ? (isRevealed ? identifier : maskIdentifier(identifier)) : '—'}</Text>
        {!!identifier && <Text style={styles.revealHint}>{isRevealed ? 'Tap to hide' : 'Tap to reveal'}</Text>}
      </TouchableOpacity>

      <View style={{ flex: 1 }} />

      <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete} disabled={isDeleting}>
        {isDeleting ? <ActivityIndicator color={colors.brand700} /> : <Text style={styles.deleteLabel}>Delete account</Text>}
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    card: { backgroundColor: colors.tint1, borderRadius: 16, padding: 18, gap: 4 },
    label: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
    value: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    revealHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
    deleteButton: { paddingVertical: 14, alignItems: 'center' },
    deleteLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.brand700 },
  });
}
