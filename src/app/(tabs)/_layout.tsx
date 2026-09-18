import { Tabs, usePathname } from 'expo-router';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, tabBarLayout, type Palette } from '../../theme';

function TabPill({ focused, colors, children }: { focused: boolean; colors: Palette; children: React.ReactNode }) {
  return (
    <View
      style={{
        width: 40,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.tint1 : 'transparent',
      }}
    >
      {children}
    </View>
  );
}

function ChatsIcon({ color, focused, colors }: { color: import('react-native').ColorValue; focused: boolean; colors: Palette }) {
  return (
    <TabPill focused={focused} colors={colors}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </Svg>
    </TabPill>
  );
}

function StatusIcon({ color, focused, colors }: { color: import('react-native').ColorValue; focused: boolean; colors: Palette }) {
  return (
    <TabPill focused={focused} colors={colors}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeDasharray="3 3" />
        <Path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      </Svg>
    </TabPill>
  );
}

function CallsIcon({ color, focused, colors }: { color: import('react-native').ColorValue; focused: boolean; colors: Palette }) {
  return (
    <TabPill focused={focused} colors={colors}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </Svg>
    </TabPill>
  );
}

function ProfileIcon({
  focused,
  colors,
  avatarObjectKey,
  initials,
}: {
  focused: boolean;
  colors: Palette;
  avatarObjectKey: string | null;
  initials: string;
}) {
  return (
    <TabPill focused={focused} colors={colors}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: focused ? 1.5 : 0,
          borderColor: colors.brand600,
        }}
      >
        <Avatar objectKey={avatarObjectKey} label={initials} size={24} />
      </View>
    </TabPill>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, displayName, avatarObjectKey } = useAuth();
  const initials = (displayName ?? userId ?? '?').slice(0, 2).toUpperCase();
  // Reuses each tab's own screen-title key rather than a fourth namespace
  // just for three labels — no default namespace needed since every call
  // below is explicitly prefixed.
  const { t } = useTranslation();
  const pathname = usePathname();

  const floatingTabBarStyle: ViewStyle = {
    position: 'absolute',
    left: tabBarLayout.sideMargin,
    right: tabBarLayout.sideMargin,
    bottom: insets.bottom + tabBarLayout.bottomMargin,
    height: tabBarLayout.height,
    borderRadius: tabBarLayout.height / 2,
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    paddingTop: 6,
    shadowColor: colors.brand900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  };
  // The floating pill is drawn as an overlay on top of every tab's content
  // (see the comment on floatingTabBarStyle) rather than reserving flex
  // space for itself, so ANY screen pushed on top of a tab's own root —
  // not just Status's composer/viewer — needs it explicitly hidden, or the
  // pill floats on top of and can obscure that screen's own bottom content
  // (first found on the Status composer's send button, then again on
  // change-identifier's submit button — a systemic issue, not one screen's
  // bug, hence checking against the root paths generically here instead of
  // hardcoding each affected screen one at a time as they get reported).
  // Every root path is present in this list so a plain uniform equality
  // check is enough; keeping the pill visible+labeled on exactly these four
  // and hidden everywhere else is what "uniform tab bar" means in practice
  // — it's never a bare-icon sliver on some screens and full on others.
  const TAB_ROOT_PATHS = ['/chats', '/status', '/calls', '/settings'];
  const hideTabBar = !TAB_ROOT_PATHS.includes(pathname);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: true,
        // Floats above the screen edge (like WhatsApp's iOS tab bar) instead
        // of docking flush to the bottom — see theme.ts's tabBarLayout/
        // TAB_BAR_CLEARANCE, which every tab screen uses to leave room for it.
        tabBarStyle: hideTabBar ? { display: 'none' } : floatingTabBarStyle,
        tabBarLabelStyle: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: t('chats:list.title'),
          tabBarIcon: ({ color, focused }) => <ChatsIcon color={color} focused={focused} colors={colors} />,
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: t('status:tab.title'),
          tabBarIcon: ({ color, focused }) => <StatusIcon color={color} focused={focused} colors={colors} />,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: t('calls:screen.title'),
          tabBarIcon: ({ color, focused }) => <CallsIcon color={color} focused={focused} colors={colors} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings:index.title'),
          tabBarIcon: ({ focused }) => (
            <ProfileIcon focused={focused} colors={colors} avatarObjectKey={avatarObjectKey} initials={initials} />
          ),
        }}
      />
    </Tabs>
  );
}
