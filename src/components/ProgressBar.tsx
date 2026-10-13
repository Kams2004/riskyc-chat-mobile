import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts } from '../theme';

type ProgressBarProps = {
  /** Shows and starts climbing while true; resets to 0% and hides the instant it flips to false. */
  active: boolean;
  label?: string;
  trackColor?: string;
  fillColor?: string;
  textColor?: string;
};

/**
 * Simulated determinate progress for short request/response flows (OTP
 * verify, device pairing) that have no real byte-level signal to drive a
 * true percentage — climbs on an easing curve toward 90% while `active`,
 * then the caller flips `active` to false right as the real operation
 * resolves, which this reads as "done" rather than stalling at 90% forever.
 * Gives a sense of motion/percentage instead of an indefinite spinner, same
 * idea as web's TabLockGate progress bar.
 */
export function ProgressBar({ active, label, trackColor, fillColor, textColor }: ProgressBarProps) {
  const { colors } = useTheme();
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!active) {
      setPercent(0);
      return;
    }
    setPercent(8);
    const interval = setInterval(() => {
      setPercent((p) => (p < 90 ? p + (90 - p) * 0.15 : p));
    }, 120);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  const track = trackColor ?? colors.tint1;
  const fill = fillColor ?? colors.brand600;
  const text = textColor ?? colors.textMuted;
  const rounded = Math.round(percent);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: text }]}>{label}</Text> : null}
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { width: `${rounded}%`, backgroundColor: fill }]} />
      </View>
      <Text style={[styles.percent, { color: text }]}>{rounded}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6, alignItems: 'center' },
  label: { fontFamily: fonts.sans, fontSize: 12.5 },
  track: { width: '80%', height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  percent: { fontFamily: fonts.sansMedium, fontSize: 12 },
});
