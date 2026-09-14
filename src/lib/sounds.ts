import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/**
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
