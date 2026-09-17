import * as Contacts from 'expo-contacts';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getAllLocalContacts, getKnownMatchedContactIds, markContactsAsKnown, upsertLocalContact } from '../../data/db';
import { matchContacts, type UserResult } from '../users/api';

export type EnrichedUser = UserResult & { localName?: string };

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^\d]/g, '');
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
 * calling this.
 */
export async function syncDeviceContacts(db: SQLiteDatabase): Promise<SyncResult> {
  const permission = await Contacts.getPermissionsAsync();
  if (!permission.granted) {
    return { matched: [], newlyJoined: [] };
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name],
  });

  const phoneNumbers = new Set<string>();
  const emails = new Set<string>();
  const phoneToName = new Map<string, string>();

  for (const contact of data) {
    const name = contact.name?.trim() || '';
    for (const phone of contact.phoneNumbers ?? []) {
      if (phone.number) {
        const norm = normalizePhone(phone.number);
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
      const deviceName = phoneToName.get(normalizePhone(user.phoneNumber));
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
