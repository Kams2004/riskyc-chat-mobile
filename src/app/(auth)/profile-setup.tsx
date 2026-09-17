import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { useAuth } from '../../features/auth/AuthContext';
import { uploadImage } from '../../features/media/api';
import { useTheme } from '../../features/theme/ThemeContext';
import { updateMyProfile } from '../../features/users/api';
import { fonts, gradients, type Palette } from '../../theme';

/**
 * A brand-new account's final onboarding step — set a name (and, for an
 * email-verified account, a phone number) before ever seeing the chat list.
 * Deliberately its own (auth)-stack screen, a sibling of language-select and
 * permissions, rather than a parameterized mode of Settings' edit-profile —
 * routing this through the Settings tab (as an earlier version of this
 * onboarding step did) left that tab's own navigation stack permanently
 * rooted on the profile editor on some devices, so every later tap of
 * Settings re-opened this screen instead of the real Settings list. A
 * screen that never touches the Settings stack at all can't have that bug,
 * by construction — see app/_layout.tsx's onboarding redirect, which now
 * sends brand-new accounts here instead.
 */
export default function ProfileSetupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const { email, updateProfile } = useAuth();
  const { t } = useTranslation('settings');
  const needsPhone = !!email;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [freshLocalUri, setFreshLocalUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('editProfile.photoPermissionTitle'), t('editProfile.photoPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setFreshLocalUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const newAvatarObjectKey = freshLocalUri ? await uploadImage(freshLocalUri) : undefined;
      const fields: { displayName: string; avatarObjectKey?: string; phoneNumber?: string } = {
        displayName: name,
        ...(newAvatarObjectKey ? { avatarObjectKey: newAvatarObjectKey } : {}),
        ...(needsPhone && phone.trim() ? { phoneNumber: phone.trim() } : {}),
      };
      await updateMyProfile(fields);
      await updateProfile({ displayName: name, ...(newAvatarObjectKey ? { avatarObjectKey: newAvatarObjectKey } : {}) });
      router.replace('/(tabs)/chats');
    } catch (e) {
      console.warn('[ProfileSetup] save failed', e);
      Alert.alert(t('editProfile.saveError'), t('common:checkConnectionAndRetry'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('editProfile.titleSetup')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            {freshLocalUri ? (
              <Image source={{ uri: freshLocalUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: 'transparent' }]}>
                {name.trim() ? (
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 32, color: colors.brand700 }}>
                    {name.trim().slice(0, 2).toUpperCase()}
                  </Text>
                ) : (
                  <Svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                  </Svg>
                )}
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.cameraBadgeTouchable} onPress={handlePickAvatar}>
            <LinearGradient colors={gradients.gold} style={styles.cameraBadge}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2}>
                <Path
                  d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('editProfile.nameLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('editProfile.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        {needsPhone && (
          <View style={[styles.field, { marginTop: 24 }]}>
            <Text style={styles.label}>
              {t('editProfile.phoneLabel')}
              <Text style={{ color: colors.brand700 }}> *</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('editProfile.phonePlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={styles.phoneHint}>{t('editProfile.phoneHint')}</Text>
          </View>
        )}

        <Button
          onPress={handleSave}
          loading={isSaving}
          disabled={!name.trim() || (needsPhone && !phone.trim())}
          style={styles.saveButton}
        >
          {t('common:save')}
        </Button>
      </ScrollView>
    </KeyboardScreen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    scrollContent: { alignItems: 'center', paddingHorizontal: 28, flexGrow: 1 },
    header: { alignSelf: 'stretch', paddingHorizontal: 28, marginBottom: 32 },
    headerTitle: { fontFamily: fonts.display, fontSize: 25, color: colors.textPrimary },
    avatarWrap: { width: 132, height: 132, marginBottom: 40 },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: 66,
      backgroundColor: colors.tint2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: { width: '100%', height: '100%' },
    cameraBadgeTouchable: { position: 'absolute', right: -2, bottom: -2 },
    cameraBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: colors.surface,
    },
    field: { width: '100%', gap: 8 },
    saveButton: { width: '100%', marginTop: 40 },
    label: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.brand900, textTransform: 'uppercase', letterSpacing: 1 },
    input: {
      borderBottomWidth: 1.5,
      borderBottomColor: colors.brand500,
      paddingVertical: 8,
      fontFamily: fonts.sans,
      fontSize: 17,
      color: colors.textPrimary,
    },
    phoneHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 4 },
  });
}
