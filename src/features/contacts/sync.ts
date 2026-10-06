import { Contact, ContactField, getPermissionsAsync } from 'expo-contacts';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getAllLocalContacts, getKnownMatchedContactIds, markContactsAsKnown, upsertLocalContact } from '../../data/db';
import { COUNTRIES } from '../../lib/countries';
import { matchContacts, type UserResult } from '../users/api';

export type EnrichedUser = UserResult & { localName?: string };

/**
 * Device contacts saved the normal way — a local number with no country
 * code, e.g. "641482013" rather than "+237641482013" — used to normalize to
 * themselves here, digits-only with no '+'. Every registered account's
 * phoneNumber is always the full international form (see login.tsx's
 * fullPhone), so that bare local number could never exact-match anything
 * server-side: a contact saved the ordinary way (the overwhelming majority
 * of entries in anyone's address book) silently never matched, even when
 * the person it belongs to really is on RiskyC Chat. defaultDialCode (the
 * signed-in user's own, via dialCodeFor below — same-country contacts are
 * by far the common case) gets prepended whenever raw has no explicit '+'.
 */
export function normalizePhone(raw: string, defaultDialCode = ''): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.replace(/[^\d]/g, '');
  }
  const digits = trimmed.replace(/[^\d]/g, '');
  return defaultDialCode ? `${defaultDialCode}${digits}` : digits;
}

/** The signed-in user's own dial code (e.g. "+237699999999" -> "+237"), used as normalizePhone's default — longest match first since some dial codes are prefixes of others (+1 vs +1xxx isn't in this list, but future entries could be). */
export function dialCodeFor(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return '';
  const match = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((c) => phoneNumber.startsWith(c.dialCode));
  return match?.dialCode ?? '';
}

export type DeviceContact = {
  name: string | null;
  phoneNumbers: { number: string }[];
  emails: { email: string }[];
};

/**
 * This SDK's expo-contacts rewrote its whole API to a class-based
 * Contact.getAll()/getAllDetails() shape — the old top-level
 * getContactsAsync()/Fields this app was written against still exist for
 * back-compat, but are now a deprecated shim that unconditionally throws at
 * runtime (see expo-contacts' own legacyWarnings.d.ts: "This method will
 * throw in runtime"), which is exactly why every screen that reads device
 * contacts failed with "Could not load your contacts" regardless of what
 * was actually saved on the device — the read itself never had a chance to
 * succeed. This wraps the new API and reshapes its result back to the old
 * {name, phoneNumbers, emails} shape so every call site's own downstream
 * matching logic didn't need touching, just the one broken fetch call.
 */
export async function readDeviceContacts(): Promise<DeviceContact[]> {
  const details = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS]);
  return details.map((c) => ({
    name: c.fullName ?? null,
    phoneNumbers: (c.phones ?? []).filter((p) => !!p.number).map((p) => ({ number: p.number as string })),
    emails: (c.emails ?? []).filter((e) => !!e.address).map((e) => ({ email: e.address as string })),
  }));
}

export type SyncResult = {
  matched: EnrichedUser[];
  /** Accounts matched THIS time that weren't in known_matched_contacts before — feeds the "X is now on RiskyC Chat" notification. */
  newlyJoined: EnrichedUser[];
};

/**
 * Reads this device's contacts, matches them against RiskyC accounts, and
 * upserts local_contacts for any match that has a device-saved name —
 * shared by new.tsx, new-group.tsx, group-info.tsx's add-member flow, and
 * useContactsSync's periodic background sync, all of which used to
 * duplicate this exact logic. Requires contacts permission to already be
 * granted (or grantable without prompting the user mid-background-sync) —
 * callers that need to prompt first should do that themselves before
 * calling this. ownPhoneNumber (the signed-in user's own, e.g. from
 * useAuth()) seeds normalizePhone's default-dial-code fallback — see its
 * own doc comment for why that's needed at all.
 */
export async function syncDeviceContacts(db: SQLiteDatabase, ownPhoneNumber?: string | null): Promise<SyncResult> {
  const permission = await getPermissionsAsync();
  if (!permission.granted) {
    return { matched: [], newlyJoined: [] };
  }

  const defaultDialCode = dialCodeFor(ownPhoneNumber);
  const data = await readDeviceContacts();

  const phoneNumbers = new Set<string>();
  const emails = new Set<string>();
  const phoneToName = new Map<string, string>();

  for (const contact of data) {
    const name = contact.name?.trim() || '';
    for (const phone of contact.phoneNumbers ?? []) {
      if (phone.number) {
        const norm = normalizePhone(phone.number, defaultDialCode);
        phoneNumbers.add(norm);
        if (name) phoneToName.set(norm, name);
      }
    }
    for (const email of contact.emails ?? []) {
      if (email.email) emails.add(email.email.trim().toLowerCase());
    }
  }

  const matched = await matchContacts([...phoneNumbers], [...emails]);

  for (const user of matched) {
    if (user.phoneNumber) {
      const deviceName = phoneToName.get(normalizePhone(user.phoneNumber, defaultDialCode));
      if (deviceName) await upsertLocalContact(db, user.userId, deviceName);
    }
  }

  const knownIds = await getKnownMatchedContactIds(db);
  const newlyJoined = matched.filter((u) => !knownIds.has(u.userId));
  await markContactsAsKnown(db, matched.map((u) => u.userId));

  const localNames = await getAllLocalContacts(db);
  const enriched: EnrichedUser[] = matched.map((u) => ({ ...u, localName: localNames.get(u.userId) }));
  const enrichedNewlyJoined: EnrichedUser[] = newlyJoined.map((u) => ({ ...u, localName: localNames.get(u.userId) }));

  return { matched: enriched, newlyJoined: enrichedNewlyJoined };
}
