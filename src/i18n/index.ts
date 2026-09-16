import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';

import enCommon from './locales/en/common';
import enAuth from './locales/en/auth';
import enChats from './locales/en/chats';
import enGroups from './locales/en/groups';
import enSettings from './locales/en/settings';
import enCalls from './locales/en/calls';
import enMedia from './locales/en/media';
import frCommon from './locales/fr/common';
import frAuth from './locales/fr/auth';
import frChats from './locales/fr/chats';
import frGroups from './locales/fr/groups';
import frSettings from './locales/fr/settings';
import frCalls from './locales/fr/calls';
import frMedia from './locales/fr/media';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_KEY = 'riskyc.pref.language';

const resources = {
  en: { common: enCommon, auth: enAuth, chats: enChats, groups: enGroups, settings: enSettings, calls: enCalls, media: enMedia },
  fr: { common: frCommon, auth: frAuth, chats: frChats, groups: frGroups, settings: frSettings, calls: frCalls, media: frMedia },
};

function isSupported(value: string | null | undefined): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Device language if it's one we support, else 'en' — never a language we have no translations for. */
function detectDeviceLanguage(): SupportedLanguage {
  const deviceCode = Localization.getLocales()[0]?.languageCode;
  return isSupported(deviceCode) ? deviceCode : 'en';
}

/**
 * Persisted choice (see the language-select onboarding step and Settings >
 * Language) if there is one, else the device's own language when supported,
 * else English. Gates app/_layout.tsx's render the same way loadPreferences
 * already does, so no screen — including the very first splash — ever
 * renders with the wrong language and then flips.
 */
export async function initI18n(): Promise<void> {
  const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
  const language = isSupported(stored) ? stored : detectDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'auth', 'chats', 'groups', 'settings', 'calls', 'media'],
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });
}

/** true only the very first time the app runs — drives the language-select onboarding step. */
export async function hasChosenLanguage(): Promise<boolean> {
  return (await SecureStore.getItemAsync(LANGUAGE_KEY)) !== null;
}

export async function setAppLanguage(language: SupportedLanguage): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
  await i18n.changeLanguage(language);
}

export default i18n;
