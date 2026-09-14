import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { brandAccents as colors, fonts, gradients } from '../theme';

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'gold';
  style?: ViewStyle;
}>;

export function Button({ children, onPress, disabled, loading, variant = 'primary', style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[styles.touchable, style, isDisabled && styles.disabled]}
    >
      <LinearGradient
        colors={variant === 'primary' ? gradients.brand : gradients.gold}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.label}>{children}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: 999,
    shadowColor: colors.brand700,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 6,
  },
  disabled: {
    opacity: 0.5,
  },
  gradient: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#ffffff',
    fontFamily: fonts.sansBold,
    fontSize: 16,
  },
});
