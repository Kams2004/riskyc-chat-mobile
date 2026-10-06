import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { PanGestureHandler, type PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';

const SWIPE_THRESHOLD = 60;

/**
 * WhatsApp-style horizontal swipe between adjacent top-level tabs (Chats <->
 * Status, per the explicit ask — not extended to Calls/Settings). expo-router's
 * <Tabs> (React Navigation's bottom-tabs under the hood) has no built-in swipe
 * support, unlike a top-tabs navigator, so this adds it at the screen level
 * instead of swapping the whole navigator out.
 *
 * activeOffsetX/failOffsetY mirrors SwipeableMessage's own doc comment (see
 * [conversationId].tsx) on this RNGH version's requirement: activeOffsetX
 * must be [negative, positive] (a dead-zone the gesture has to clear before
 * activating), and failOffsetY lets a mostly-vertical touch (scrolling the
 * list) fall through untouched instead of being captured by this handler.
 */
export function SwipeBetweenTabs({
  toLeft,
  toRight,
  children,
}: PropsWithChildren<{
  /** Route to navigate to on a leftward swipe (finger moving right-to-left). */
  toLeft?: string;
  /** Route to navigate to on a rightward swipe (finger moving left-to-right). */
  toRight?: string;
}>) {
  return (
    <PanGestureHandler
      activeOffsetX={[-20, 20]}
      failOffsetY={[-10, 10]}
      onHandlerStateChange={({ nativeEvent }) => {
        // state 5 = END (see [conversationId].tsx's SwipeableMessage for the same convention)
        if (nativeEvent.state !== 5) return;
        const { translationX, translationY } = nativeEvent;
        if (Math.abs(translationX) < Math.abs(translationY)) return;
        if (translationX <= -SWIPE_THRESHOLD && toLeft) {
          router.push(toLeft as never);
        } else if (translationX >= SWIPE_THRESHOLD && toRight) {
          router.push(toRight as never);
        }
      }}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </PanGestureHandler>
  );
}
