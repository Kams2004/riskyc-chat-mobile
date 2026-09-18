import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * WhatsApp-style status ring: a solid circle for one status, split into N
 * gapped arcs for N — each arc individually colored (unviewed vs. viewed),
 * so a partially-viewed set of updates is visible at a glance without
 * opening the viewer. `viewedFlags[i]` is missing/true means "seen"; the
 * ring falls back to all-unviewed-color when flags aren't provided (the
 * "my status" row, where viewed/unviewed isn't a meaningful distinction
 * for your own posts).
 */
export function StatusRing({
  size,
  count,
  viewedFlags,
  unviewedColor,
  viewedColor,
  strokeWidth = 2.5,
  children,
}: {
  size: number;
  count: number;
  viewedFlags?: boolean[];
  unviewedColor: string;
  viewedColor: string;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  const safeCount = Math.max(count, 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapDeg = safeCount > 1 ? 10 : 0;
  const segDeg = 360 / safeCount - gapDeg;
  const segLen = (segDeg / 360) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {Array.from({ length: safeCount }).map((_, i) => (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={viewedFlags && viewedFlags[i] ? viewedColor : unviewedColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${segLen} ${circumference - segLen}`}
            strokeDashoffset={-((i * (segDeg + gapDeg)) / 360) * circumference}
          />
        ))}
      </Svg>
      <View style={{ position: 'absolute', top: strokeWidth + 2, left: strokeWidth + 2, right: strokeWidth + 2, bottom: strokeWidth + 2, borderRadius: size / 2, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}
