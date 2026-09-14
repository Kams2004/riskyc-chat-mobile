import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAuth } from '../../../features/auth/AuthContext';
import { uploadImage } from '../../../features/media/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { updateMyProfile } from '../../../features/users/api';
import { fonts, gradients, type Palette } from '../../../theme';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const { displayName, avatarObjectKey, updateProfile } = useAuth();
  const [name, setName] = useState(displayName ?? '');
  // Only set once the user picks a NEW photo this session — until then the
  // existing remote avatarObjectKey (if any) is shown via Avatar/useMediaUrl,
  // same as anyone else's avatar renders everywhere else in the app.
  const [freshLocalUri, setFreshLocalUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile picture.');
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
      await updateMyProfile({ displayName: name, ...(newAvatarObjectKey ? { avatarObjectKey: newAvatarObjectKey } : {}) });
      await updateProfile({ displayName: name, ...(newAvatarObjectKey ? { avatarObjectKey: newAvatarObjectKey } : {}) });
      // A brand-new account is routed straight here (see app/_layout.tsx's
      // onboarding redirect) before ever seeing the chat list, so there's no
      // previous screen for router.back() to return to.
      if (displayName) {
        router.back();
      } else {
        router.replace('/(tabs)/chats');
      }
    } catch (e) {
      console.warn('[EditProfile] save failed', e);
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{displayName ? 'Edit profile' : 'Set up your profile'}</Text>
      </View>

      {/*
        A ScrollView instead of a flex:1 spacer pushing the button to the
        bottom: that spacer collapses to ~0 once the keyboard eats enough
        height that content no longer fits, leaving the button jammed
        directly under the input (or, on some devices, clipped by the nav
        bar in the resting state) — reported twice now. Scrolling instead
        guarantees the button is always reachable regardless of keyboard
        height or device size, and keyboardShouldPersistTaps lets the Save
        button itself be tapped without first needing a second tap to
        dismiss the keyboard.
      */}
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
              <Avatar objectKey={avatarObjectKey} label={name || displayName || '?'} size={96} />
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
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <Button onPress={handleSave} loading={isSaving} disabled={!name.trim()} style={styles.saveButton}>
          Save
        </Button>
      </ScrollView>
    </KeyboardScreen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    scrollContent: { alignItems: 'center', paddingHorizontal: 28, flexGrow: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', paddingHorizontal: 28, marginBottom: 32 },
    backTouchable: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: colors.textPrimary },
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
    // scrollContent uses alignItems: 'center' (for the avatar), which
    // otherwise shrinks the button to hug its content instead of spanning
    // the width like a normal full-size button — this is what "squished"
    // looked like. marginTop replaces the old flex:1 spacer, which
    // collapsed to ~0 once the keyboard was open.
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
  });
}
