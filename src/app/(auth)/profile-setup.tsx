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
import { PersonIcon } from '../../components/icons';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { useAuth } from '../../features/auth/AuthContext';
import { uploadImage } from '../../features/media/api';
import { useTheme } from '../../features/theme/ThemeContext';
import { setOnboardingPhone, updateMyProfile } from '../../features/users/api';
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

  const { email, phoneNumber, updateProfile, completeSystemLogin } = useAuth();
  const { t } = useTranslation('settings');
  // Mutually exclusive: profile-setup only ever runs for a genuinely brand-
  // new account (see the class doc comment below), so whichever identifier
  // it verified with is already set here and the OTHER one is what's
  // missing. needsPhone is required to finish onboarding (see
  // setOnboardingPhone's own doc comment for why); needsEmail is a
  // convenience alias, save-only, entirely optional.
  const needsPhone = !!email;
  const needsEmail = !!phoneNumber;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [freshLocalUri, setFreshLocalUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Phone number is this app's canonical identity — even for an account
   * that verified via email, so a brand-new email-only account can't sit
   * disconnected from a pre-existing phone-based account that's actually
   * the same real person. See UserController#setOnboardingPhone's own doc
   * comment for the full design, including the deliberate choice NOT to
   * verify ownership of the phone via OTP here (an explicit, informed
   * tradeoff to avoid a second billed SMS on top of the one that already
   * verified this account's email) — merely typing the right number is
   * enough to be routed into an existing account with it.
   */
  async function handleContinue() {
    setIsSaving(true);
    try {
      const newAvatarObjectKey = freshLocalUri ? await uploadImage(freshLocalUri) : undefined;

      if (needsPhone) {
        const result = await setOnboardingPhone(phone.trim());
        if (result.merged && result.accessToken && result.user) {
          // Routed into a pre-existing account — the name/avatar just
          // typed belong to the discarded, brand-new account, not this
          // one, so they're deliberately never applied. If this (real)
          // account itself still needs onboarding, app/_layout.tsx's own
          // guard redirects here again automatically, for THIS account.
          await completeSystemLogin({
            accessToken: result.accessToken,
            userId: result.user.userId,
            displayName: result.user.displayName,
            avatarObjectKey: result.user.avatarObjectKey,
            email: result.user.email,
            phoneNumber: result.user.phoneNumber,
            requiresDeviceSwitchConfirmation: false,
            confirmationToken: null,
            conflictingDeviceLabel: null,
          });
          Alert.alert(t('editProfile.welcomeBackTitle'), t('editProfile.welcomeBackBody'));
          router.replace('/(tabs)/chats');
          return;
        }
      }

      const fields: { displayName: string; avatarObjectKey?: string; email?: string } = {
        displayName: name,
        ...(newAvatarObjectKey ? { avatarObjectKey: newAvatarObjectKey } : {}),
        ...(needsEmail && emailInput.trim() ? { email: emailInput.trim() } : {}),
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
                  <PersonIcon size={52} color={colors.brand700} strokeWidth={1.8} />
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

        {needsEmail && (
          <View style={[styles.field, { marginTop: 24 }]}>
            <Text style={styles.label}>{t('editProfile.emailLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('editProfile.emailPlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={emailInput}
              onChangeText={setEmailInput}
            />
            <Text style={styles.phoneHint}>{t('editProfile.emailHint')}</Text>
          </View>
        )}

        <Button
          onPress={handleContinue}
          loading={isSaving}
          disabled={!name.trim() || (needsPhone && !phone.trim())}
          style={styles.saveButton}
        >
          {needsPhone ? t('common:continue') : t('common:save')}
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
