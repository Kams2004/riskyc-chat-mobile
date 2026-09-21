import { Image, StyleSheet, Text, View } from 'react-native';

import { useMediaUrl } from '../features/media/useMediaUrl';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts } from '../theme';
import { PersonIcon } from './icons';

type AvatarProps = {
  /** Use for the signed-in user's own avatar — already on-device, no network round trip needed. */
  localUri?: string | null;
  /** Use for anyone else's avatar — resolved to a presigned URL from media-service. */
  objectKey?: string | null;
  label: string;
  size?: number;
};

/** Returns true when the label is a phone number (digits/+/spaces/dashes) rather than a real name. */
function looksLikePhoneNumber(label: string): boolean {
  return /^[+\d][\d\s\-().]{3,}$/.test(label.trim());
}

export function Avatar({ localUri, objectKey, label, size = 52 }: AvatarProps) {
  const { colors } = useTheme();
  const resolvedUrl = useMediaUrl(localUri ? null : objectKey);

  const uri = localUri || resolvedUrl;
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={dimension} />;
  }

  const showIcon = !label || looksLikePhoneNumber(label);
  const iconSize = size * 0.48;

  return (
    <View style={[styles.placeholder, dimension, { backgroundColor: colors.tint2 }]}>
      {showIcon ? (
        <PersonIcon size={iconSize} color={colors.brand700} strokeWidth={1.8} />
      ) : (
        <Text style={[styles.label, { color: colors.brand700, fontSize: size * 0.32 }]}>
          {label.trim().slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.sansBold },
});
