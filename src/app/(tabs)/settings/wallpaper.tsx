import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import { ChatWallpaper } from '../../../components/ChatWallpaper';
import { useTheme } from '../../../features/theme/ThemeContext';
import { useWallpaper, type WallpaperVariant } from '../../../features/wallpaper/WallpaperContext';
import { fonts, type Palette } from '../../../theme';

const VARIANTS: WallpaperVariant[] = ['dots', 'doodle', 'plain'];

function Check({ colors }: { colors: Palette }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

export default function WallpaperSettingsScreen() {
  const { colors } = useTheme();
  const { variant, setVariant } = useWallpaper();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('settings');

  const labels: Record<WallpaperVariant, string> = {
    dots: t('wallpaper.dots'),
    doodle: t('wallpaper.doodle'),
    plain: t('wallpaper.plain'),
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('wallpaper.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>{t('wallpaper.subtitle')}</Text>

      <View style={styles.grid}>
        {VARIANTS.map((v) => {
          const active = variant === v;
          return (
            <TouchableOpacity key={v} style={styles.option} onPress={() => setVariant(v)}>
              <View style={[styles.previewWrap, active && styles.previewWrapActive]}>
                <ChatWallpaper variant={v} />
                {active && (
                  <View style={styles.checkBadge}>
                    <Check colors={colors} />
                  </View>
                )}
              </View>
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{labels[v]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 8 },
    backTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, paddingHorizontal: 20, marginBottom: 18 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingHorizontal: 20 },
    option: { alignItems: 'center', gap: 8, width: 104 },
    previewWrap: {
      width: 104,
      height: 150,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    previewWrapActive: { borderColor: colors.brand600 },
    checkBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.brand600,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
    optionLabelActive: { color: colors.textPrimary, fontFamily: fonts.sansSemiBold },
  });
}
