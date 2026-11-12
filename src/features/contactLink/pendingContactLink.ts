import { COUNTRIES } from '../../lib/countries';
import { dialCodeFor, normalizePhone } from '../contacts/sync';

/**
 * A contact link (riskycchat://contact?phone=… or riskycchat://u/<userId>) opened while signed out. The link's own
 * screen can't run until there's an account, so it's remembered here and RootNavigator reopens it once sign-in and
 * onboarding finish. In-memory only: it only has to survive the sign-in flow of the same app session.
 */
export type PendingContactLink =
  | { kind: 'phone'; phone: string; name?: string }
  | { kind: 'user'; userId: string };

let pending: PendingContactLink | null = null;

export function setPendingContactLink(link: PendingContactLink) {
  pending = link;
}

/** Returns the remembered link (if any) and forgets it, so it only reopens once. */
export function takePendingContactLink(): PendingContactLink | null {
  const link = pending;
  pending = null;
  return link;
}

/**
 * A link's phone is meant to be E.164, but may arrive without its '+' (e.g. "237699…") or with spaces. Accounts are
 * always stored in full international form, so: keep an explicit '+'; treat digits already starting with the default
 * country code (and long enough to hold a local number after it) as international; otherwise prepend that code —
 * the signed-in user's own, or the app's first/default country, like login and the New chat screen do.
 */
export function normalizeLinkPhone(raw: string, ownPhoneNumber?: string | null): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return normalizePhone(trimmed);
  const digits = trimmed.replace(/[^\d]/g, '');
  const dial = dialCodeFor(ownPhoneNumber) || COUNTRIES[0].dialCode;
  const dialDigits = dial.replace('+', '');
  if (digits.startsWith(dialDigits) && digits.length >= dialDigits.length + 8) return `+${digits}`;
  return normalizePhone(digits, dial);
}
