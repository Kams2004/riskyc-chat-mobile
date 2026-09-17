import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { StatusOverlayView, type DrawStroke, type OverlayPoint, type StatusOverlay } from './StatusOverlayView';

/**
 * Freehand drawing surface for the status composer. Only captures touches
 * while `active` (the pencil tool is toggled on) — otherwise renders as a
 * plain read-only StatusOverlayView so it never blocks the swipe-between-
 * pending-items gesture or the media itself underneath. Points are recorded
 * as fractions of this view's own width/height (see StatusOverlayView's own
 * doc comment) so the stroke lines up identically wherever it's replayed.
 */
export function StatusDrawingCanvas({
  overlay,
  onChangeOverlay,
  color,
  width,
  height,
  active,
}: {
  overlay: StatusOverlay;
  onChangeOverlay: (overlay: StatusOverlay) => void;
  color: string;
  width: number;
  height: number;
  active: boolean;
}) {
  const [currentPoints, setCurrentPoints] = useState<OverlayPoint[]>([]);
  const currentPointsRef = useRef<OverlayPoint[]>([]);

  // A PanResponder created once via useRef would forever close over this
  // render's `active`/`color`/`overlay` — stale on every prop change after
  // the first render. Recreating it fresh each render (cheap: it's just a
  // plain object of callbacks) keeps every handler reading current props.
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => active,
    onMoveShouldSetPanResponder: () => active,
    onPanResponderGrant: (e) => {
      const point = { x: e.nativeEvent.locationX / width, y: e.nativeEvent.locationY / height };
      currentPointsRef.current = [point];
      setCurrentPoints([point]);
    },
    onPanResponderMove: (e) => {
      const point = { x: e.nativeEvent.locationX / width, y: e.nativeEvent.locationY / height };
      currentPointsRef.current = [...currentPointsRef.current, point];
      setCurrentPoints(currentPointsRef.current);
    },
    onPanResponderRelease: () => {
      if (currentPointsRef.current.length > 1) {
        const stroke: DrawStroke = { color, points: currentPointsRef.current };
        onChangeOverlay({ ...overlay, strokes: [...overlay.strokes, stroke] });
      }
      currentPointsRef.current = [];
      setCurrentPoints([]);
    },
  });

  if (!active) {
    return <StatusOverlayView overlay={overlay} width={width} height={height} />;
  }

  const currentPath =
    currentPoints.length > 1
      ? `M ${currentPoints[0].x * width} ${currentPoints[0].y * height} ` +
        currentPoints.slice(1).map((p) => `L ${p.x * width} ${p.y * height}`).join(' ')
      : '';

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} {...panResponder.panHandlers}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {overlay.strokes.map((stroke, i) => (
          <Path
            key={i}
            d={`M ${stroke.points[0].x * width} ${stroke.points[0].y * height} ` +
              stroke.points.slice(1).map((p) => `L ${p.x * width} ${p.y * height}`).join(' ')}
            stroke={stroke.color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        {!!currentPath && <Path d={currentPath} stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      </Svg>
    </View>
  );
}
