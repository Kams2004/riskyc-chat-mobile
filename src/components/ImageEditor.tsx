import * as ImageManipulator from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { Image, LayoutChangeEvent, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';
import { StatusDrawingCanvas } from './StatusDrawingCanvas';
import { EMPTY_OVERLAY, type StatusOverlay } from './StatusOverlayView';

const DRAW_COLORS = ['#ffffff', '#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0', '#000000'];
const MIN_CROP = 0.08;

type Tool = 'crop' | 'rotate' | 'draw';
type CropRect = { x: number; y: number; width: number; height: number }; // fractional, 0-1

type ImageEditorProps = {
  visible: boolean;
  uri: string;
  initialOverlay: StatusOverlay;
  onCancel: () => void;
  onConfirm: (result: { uri: string; overlay: StatusOverlay }) => void;
};

/**
 * Crop and rotate bake new pixels immediately via expo-image-manipulator's
 * object-oriented API (each applied right away, not deferred, so crop math
 * always works against the current already-rotated image). Drawing reuses
 * StatusDrawingCanvas/StatusOverlayView as-is — non-destructive, an overlay
 * composited at view time, same convention already proven for Status.
 */
export function ImageEditor({ visible, uri, initialOverlay, onCancel, onConfirm }: ImageEditorProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [workingUri, setWorkingUri] = useState(uri);
  const [tool, setTool] = useState<Tool>('draw');
  const [overlay, setOverlay] = useState<StatusOverlay>(initialOverlay);
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [boxSize, setBoxSize] = useState({ width: 1, height: 1 });
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  const cropRectRef = useRef(cropRect);
  cropRectRef.current = cropRect;

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setBoxSize({ width, height });
  }

  async function applyRotate() {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const context = ImageManipulator.ImageManipulator.manipulate(workingUri);
      context.rotate(90);
      const image = await context.renderAsync();
      const result = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG });
      setWorkingUri(result.uri);
      setCropRect({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    } catch (e) {
      console.warn('[ImageEditor] rotate failed', e);
    } finally {
      setIsProcessing(false);
    }
  }

  async function applyCrop() {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const rect = cropRectRef.current;
      // expo-image-manipulator's crop() takes pixel coordinates of the
      // SOURCE image, not the rendered preview box — read the actual image
      // size first via Image.getSize, since boxSize is just the on-screen
      // layout.
      const { width: srcWidth, height: srcHeight } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(workingUri, (w, h) => resolve({ width: w, height: h }), reject);
      });
      const context = ImageManipulator.ImageManipulator.manipulate(workingUri);
      context.crop({
        originX: Math.round(rect.x * srcWidth),
        originY: Math.round(rect.y * srcHeight),
        width: Math.round(rect.width * srcWidth),
        height: Math.round(rect.height * srcHeight),
      });
      const image = await context.renderAsync();
      const result = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG });
      setWorkingUri(result.uri);
      setCropRect({ x: 0, y: 0, width: 1, height: 1 });
      // A crop shifts everything drawn so far out from under its old
      // coordinates — clearing rather than remapping strokes, same
      // tradeoff web's ImageEditor makes for the same reason.
      setOverlay(EMPTY_OVERLAY);
    } catch (e) {
      console.warn('[ImageEditor] crop failed', e);
    } finally {
      setIsProcessing(false);
    }
  }

  function clampCropDrag(mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', start: CropRect, dx: number, dy: number): CropRect {
    if (mode === 'move') {
      const x = Math.max(0, Math.min(1 - start.width, start.x + dx));
      const y = Math.max(0, Math.min(1 - start.height, start.y + dy));
      return { ...start, x, y };
    }
    let { x, y, width, height } = start;
    if (mode === 'nw' || mode === 'sw') {
      const newX = Math.max(0, Math.min(start.x + start.width - MIN_CROP, start.x + dx));
      width = start.x + start.width - newX;
      x = newX;
    } else {
      width = Math.max(MIN_CROP, Math.min(1 - start.x, start.width + dx));
    }
    if (mode === 'nw' || mode === 'ne') {
      const newY = Math.max(0, Math.min(start.y + start.height - MIN_CROP, start.y + dy));
      height = start.y + start.height - newY;
      y = newY;
    } else {
      height = Math.max(MIN_CROP, Math.min(1 - start.y, start.height + dy));
    }
    return { x, y, width, height };
  }

  function makeCropResponder(mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') {
    let start = cropRectRef.current;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = cropRectRef.current;
      },
      onPanResponderMove: (_e, gesture) => {
        if (boxSize.width === 0 || boxSize.height === 0) return;
        const dx = gesture.dx / boxSize.width;
        const dy = gesture.dy / boxSize.height;
        setCropRect(clampCropDrag(mode, start, dx, dy));
      },
    });
  }

  const cropResponders = useRef({
    move: makeCropResponder('move'),
    nw: makeCropResponder('nw'),
    ne: makeCropResponder('ne'),
    sw: makeCropResponder('sw'),
    se: makeCropResponder('se'),
  });
  // Recreated whenever the crop tool becomes active/boxSize changes, so drag
  // handlers always close over current boxSize — same "recreate every
  // render" reasoning StatusDrawingCanvas already documents for itself.
  if (tool === 'crop') {
    cropResponders.current = {
      move: makeCropResponder('move'),
      nw: makeCropResponder('nw'),
      ne: makeCropResponder('ne'),
      sw: makeCropResponder('sw'),
      se: makeCropResponder('se'),
    };
  }

  function handleDone() {
    onConfirm({ uri: workingUri, overlay });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.iconTouchable} onPress={onCancel}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.tools}>
            <TouchableOpacity style={[styles.tool, tool === 'crop' && styles.toolActive]} onPress={() => setTool('crop')}>
              <Text style={[styles.toolText, tool === 'crop' && styles.toolTextActive]}>Crop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tool, tool === 'rotate' && styles.toolActive]} onPress={() => setTool('rotate')}>
              <Text style={[styles.toolText, tool === 'rotate' && styles.toolTextActive]}>Rotate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tool, tool === 'draw' && styles.toolActive]} onPress={() => setTool('draw')}>
              <Text style={[styles.toolText, tool === 'draw' && styles.toolTextActive]}>Draw</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.iconTouchable, styles.doneTouchable]} onPress={handleDone}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 6L9 17l-5-5" />
            </Svg>
          </TouchableOpacity>
        </View>

        <View style={styles.canvasArea} onLayout={handleLayout}>
          <Image source={{ uri: workingUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          {boxSize.width > 1 && (
            <StatusDrawingCanvas
              overlay={overlay}
              onChangeOverlay={setOverlay}
              color={drawColor}
              width={boxSize.width}
              height={boxSize.height}
              active={tool === 'draw'}
            />
          )}

          {tool === 'crop' && boxSize.width > 1 && (
            <View
              style={[
                styles.cropRect,
                {
                  left: cropRect.x * boxSize.width,
                  top: cropRect.y * boxSize.height,
                  width: cropRect.width * boxSize.width,
                  height: cropRect.height * boxSize.height,
                },
              ]}
              {...cropResponders.current.move.panHandlers}
            >
              <View style={[styles.cropHandle, styles.cropHandleNw]} {...cropResponders.current.nw.panHandlers} />
              <View style={[styles.cropHandle, styles.cropHandleNe]} {...cropResponders.current.ne.panHandlers} />
              <View style={[styles.cropHandle, styles.cropHandleSw]} {...cropResponders.current.sw.panHandlers} />
              <View style={[styles.cropHandle, styles.cropHandleSe]} {...cropResponders.current.se.panHandlers} />
            </View>
          )}
        </View>

        {tool === 'rotate' && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={applyRotate} disabled={isProcessing}>
              <Text style={styles.actionButtonText}>Rotate 90°</Text>
            </TouchableOpacity>
          </View>
        )}

        {tool === 'crop' && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={applyCrop} disabled={isProcessing}>
              <Text style={styles.actionButtonText}>Apply crop</Text>
            </TouchableOpacity>
          </View>
        )}

        {tool === 'draw' && (
          <View style={[styles.actions, styles.swatchRow]}>
            {DRAW_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.swatch, { backgroundColor: c }, drawColor === c && styles.swatchActive]}
                onPress={() => setDrawColor(c)}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingTop: 48 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    doneTouchable: { backgroundColor: colors.brand500, borderRadius: 20 },
    tools: { flexDirection: 'row', gap: 8 },
    tool: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.tint1 },
    toolActive: { backgroundColor: colors.brand500 },
    toolText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textPrimary },
    toolTextActive: { color: '#ffffff' },
    canvasArea: { flex: 1, backgroundColor: '#000' },
    cropRect: { position: 'absolute', borderWidth: 2, borderColor: '#ffffff' },
    cropHandle: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 2, borderColor: colors.brand500 },
    cropHandleNw: { left: -12, top: -12 },
    cropHandleNe: { right: -12, top: -12 },
    cropHandleSw: { left: -12, bottom: -12 },
    cropHandleSe: { right: -12, bottom: -12 },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, gap: 10 },
    actionButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.brand500 },
    actionButtonText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#ffffff' },
    swatchRow: { gap: 10 },
    swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
    swatchActive: { borderColor: colors.brand500 },
  });
}
