import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts } from '../theme';

/** Fractional (0–1) coordinates relative to the media's own width/height — renders identically regardless of how large the composer or viewer happens to draw the media at. */
export type OverlayPoint = { x: number; y: number };
export type DrawStroke = { color: string; points: OverlayPoint[] };
export type TextLabel = { text: string; color: string; x: number; y: number };
export type StatusOverlay = { strokes: DrawStroke[]; text: TextLabel | null };

export const EMPTY_OVERLAY: StatusOverlay = { strokes: [], text: null };

export function isOverlayEmpty(overlay: StatusOverlay): boolean {
  return overlay.strokes.length === 0 && !overlay.text;
}

export function serializeOverlay(overlay: StatusOverlay): string | null {
  return isOverlayEmpty(overlay) ? null : JSON.stringify(overlay);
}

export function parseOverlay(json: string | null | undefined): StatusOverlay | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as StatusOverlay;
  } catch {
    return null;
  }
}

function pathFor(points: OverlayPoint[], width: number, height: number): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x * width} ${first.y * height} ` + rest.map((p) => `L ${p.x * width} ${p.y * height}`).join(' ');
}

/** Read-only render of an overlay on top of media it was drawn on — used by both the composer's live preview and the story viewer. Never intercepts touches (pointerEvents="none") so it can sit on top of a Pressable/PanResponder surface underneath. */
export function StatusOverlayView({ overlay, width, height }: { overlay: StatusOverlay | null; width: number; height: number }) {
  if (!overlay || isOverlayEmpty(overlay)) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {overlay.strokes.map((stroke, i) => (
          <Path key={i} d={pathFor(stroke.points, width, height)} stroke={stroke.color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>
      {overlay.text && (
        <Text
          style={[
            styles.textLabel,
            { color: overlay.text.color, left: overlay.text.x * width, top: overlay.text.y * height },
          ]}
        >
          {overlay.text.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  textLabel: {
    position: 'absolute',
    fontFamily: fonts.sansBold,
    fontSize: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    maxWidth: '80%',
  },
});
