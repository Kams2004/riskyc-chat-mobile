import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/**
 * These two bundled files are ONLY what plays while the app is in the
 * foreground (an already-open thread receiving a message, an active
 * CallOverlay ringing) — there is no cross-platform API to read or play
 * "whatever ringtone/notification sound the user has actually configured
 * on their device" for in-app playback like this; iOS in particular never
 * exposes the system ringtone to third-party apps at all. The
 * backgrounded/killed-app case — arguably the one that matters most, since
 * that's when the phone is expected to actually ring/chime — DOES use the
 * device's own configured sound: see usePushNotifications.ts's Android
 * notification channels (sound: 'default') and the server's Expo push
 * payload (sound: "default"), neither of which bundle a custom file.
 *
 * Two lazily-created, reused players (not one-shot createAudioPlayer() per
 * call) — a fresh player per notification would leak native audio
 * resources, and a ringtone specifically needs a persistent player to
 * pause/rewind when a call is answered/declined rather than letting it
 * finish its loop.
 */
let notificationPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let ringtonePlayer: ReturnType<typeof createAudioPlayer> | null = null;
let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  // Alert sounds should play even if the device's ringer is on "silent" via
  // the hardware switch (iOS) and mix with, not stop, anything else
  // playing — same expectation as a normal phone's message/call sounds.
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

/** A short one-shot sound for an incoming chat message. */
export async function playNotificationSound() {
  await ensureAudioMode();
  if (!notificationPlayer) {
    notificationPlayer = createAudioPlayer(require('../../assets/sounds/notification.wav'));
  }
  await notificationPlayer.seekTo(0);
  notificationPlayer.play();
}

/** Starts looping the incoming-call ringtone; call stopRingtone() to stop it. */
export async function playRingtone() {
  await ensureAudioMode();
  if (!ringtonePlayer) {
    ringtonePlayer = createAudioPlayer(require('../../assets/sounds/ringtone.wav'));
    ringtonePlayer.loop = true;
  }
  await ringtonePlayer.seekTo(0);
  ringtonePlayer.play();
}

export function stopRingtone() {
  ringtonePlayer?.pause();
}

/**
 * Speakerphone toggle for an active call. There's no separate "call audio"
 * API in react-native-webrtc — its native audio rendering goes through the
 * same platform audio session expo-audio's setAudioModeAsync configures, so
 * reusing it here is the standard workaround for the missing dedicated
 * audio-routing library. allowsRecording: true switches iOS into the
 * playAndRecord session category, which is what makes
 * shouldRouteThroughEarpiece take effect there at all (accurate for a live
 * call anyway — the microphone really is active).
 */
export async function setSpeakerphoneEnabled(enabled: boolean) {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldRouteThroughEarpiece: !enabled,
  }).catch(() => {});
}
