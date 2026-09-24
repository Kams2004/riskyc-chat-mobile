import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'riskyc.db';

export type MediaType = 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO' | 'CALL' | 'STICKER';

export type AttachmentItem = {
  position: number;
  mediaType: 'IMAGE' | 'VIDEO';
  mediaObjectKey: string;
  mediaFileName: string | null;
  mediaDurationMs: number | null;
};

export type LocalMessage = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  sent_at: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  media_type: MediaType | null;
  media_object_key: string | null;
  media_file_name: string | null;
  media_duration_ms: number | null;
  // Comma-separated normalized amplitude samples (0-100 ints) for an AUDIO
  // message — real data captured live during recording (see VoiceRecorder's
  // metering), not synthesized. Null for every non-voice message and for a
  // voice message sent before this column existed.
  media_waveform: string | null;
  // SQLite hands INTEGER columns back as 0|1, not real booleans — truthy
  // checks in the UI work fine either way, so this is left as-is rather
  // than converted.
  edited: number;
  deleted: number;
  forwarded: number;
  // Local mirror of the server's MessageDeletion marker (see
  // markDeletedForMe) — set immediately on the optimistic local call and
  // never touched by an incoming MessageMutation, which only ever carries
  // the shared edited/deleted fields. This is a per-viewer hide, invisible
  // to every other participant.
  deleted_for_me: number;
  // JSON-serialized AttachmentItem[] — populated only for a multi-image/
  // video gallery send, null otherwise (the single-attachment fields above
  // are used instead). See parseAttachments.
  attachments_json: string | null;
  // All four null for a message that isn't a reply — generated client-side
  // at send time (see useConversation's sendMessage) so a "reply privately"
  // recipient can render the quote without ever having synced the original
  // conversation locally.
  reply_to_message_id: string | null;
  reply_to_conversation_id: string | null;
  reply_to_sender_id: string | null;
  reply_to_snippet: string | null;
  // Shared, per-conversation pin (see Message.java's own comment) — 0|1.
  pinned: number;
  // A group event log line ("X joined the group"), not something a person
  // typed — see Message.java's own isSystem doc comment. 0|1.
  is_system: number;
  // Both null unless this message is a reply to a status — see
  // StatusReplyBar and Message.java's own field comment.
  reply_to_status_id: string | null;
  reply_to_status_owner_id: string | null;
};

/** Never throws on malformed/missing JSON — a display concern, not worth crashing the message list over. */
export function parseAttachments(message: LocalMessage): AttachmentItem[] {
  if (!message.attachments_json) return [];
  try {
    const parsed = JSON.parse(message.attachments_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type LocalConversation = {
  id: string;
  title: string;
  last_message_at: string | null;
  avatar_object_key: string | null;
  unread_count: number;
  is_group: number;
  is_favorite: number;
  is_muted: number;
  is_archived: number;
  last_message_snippet: string | null;
  last_message_type: string | null;
  last_message_sender_id: string | null;
};

export type LocalGroupMember = {
  group_id: string;
  user_id: string;
  display_name: string | null;
  avatar_object_key: string | null;
  role: 'ADMIN' | 'MEMBER';
};

export async function upsertMessage(db: SQLiteDatabase, message: LocalMessage) {
  await db.runAsync(
    `INSERT INTO messages (message_id, conversation_id, sender_id, recipient_id, ciphertext, sent_at, status,
       media_type, media_object_key, media_file_name, media_duration_ms, media_waveform, edited, deleted, forwarded, attachments_json,
       reply_to_message_id, reply_to_conversation_id, reply_to_sender_id, reply_to_snippet, pinned,
       is_system, reply_to_status_id, reply_to_status_owner_id)
     VALUES ($messageId, $conversationId, $senderId, $recipientId, $ciphertext, $sentAt, $status,
       $mediaType, $mediaObjectKey, $mediaFileName, $mediaDurationMs, $mediaWaveform, $edited, $deleted, $forwarded, $attachmentsJson,
       $replyToMessageId, $replyToConversationId, $replyToSenderId, $replyToSnippet, $pinned,
       $isSystem, $replyToStatusId, $replyToStatusOwnerId)
     ON CONFLICT(message_id) DO UPDATE SET status = excluded.status`,
    {
      $messageId: message.message_id,
      $conversationId: message.conversation_id,
      $senderId: message.sender_id,
      $recipientId: message.recipient_id,
      $ciphertext: message.ciphertext,
      $sentAt: message.sent_at,
      $status: message.status,
      $mediaType: message.media_type,
      $mediaObjectKey: message.media_object_key,
      $mediaFileName: message.media_file_name,
      $mediaDurationMs: message.media_duration_ms,
      $mediaWaveform: message.media_waveform,
      $attachmentsJson: message.attachments_json,
      $edited: message.edited,
      $deleted: message.deleted,
      $forwarded: message.forwarded,
      $replyToMessageId: message.reply_to_message_id,
      $replyToConversationId: message.reply_to_conversation_id,
      $replyToSenderId: message.reply_to_sender_id,
      $replyToSnippet: message.reply_to_snippet,
      $pinned: message.pinned,
      $isSystem: message.is_system,
      $replyToStatusId: message.reply_to_status_id,
      $replyToStatusOwnerId: message.reply_to_status_owner_id,
    }
  );
}

/** Local-only "delete for me" — never synced from the server, set immediately on the acting user's own device. */
export async function markDeletedForMe(db: SQLiteDatabase, messageId: string) {
  await db.runAsync('UPDATE messages SET deleted_for_me = 1 WHERE message_id = $messageId', { $messageId: messageId });
}

/** Applies a synced edit/delete/pin from the message's own conversation — authoritative, no ordinal guard needed. */
export async function applyMessageMutation(
  db: SQLiteDatabase,
  messageId: string,
  mutation: { ciphertext: string | null; edited: boolean; deleted: boolean; pinned?: boolean }
) {
  await db.runAsync(
    `UPDATE messages SET
       ciphertext = COALESCE($ciphertext, ciphertext),
       edited = $edited,
       deleted = $deleted,
       pinned = COALESCE($pinned, pinned)
     WHERE message_id = $messageId`,
    {
      $messageId: messageId,
      $ciphertext: mutation.ciphertext,
      $edited: mutation.edited ? 1 : 0,
      $deleted: mutation.deleted ? 1 : 0,
      $pinned: mutation.pinned === undefined ? null : mutation.pinned ? 1 : 0,
    }
  );
}

/** Local-only optimistic pin toggle — doesn't touch edited/deleted, unlike applyMessageMutation. */
export async function setPinnedLocally(db: SQLiteDatabase, messageId: string, pinned: boolean) {
  await db.runAsync('UPDATE messages SET pinned = $pinned WHERE message_id = $messageId', {
    $messageId: messageId,
    $pinned: pinned ? 1 : 0,
  });
}

/** Feeds the thread's pin banner — most recently pinned, not-deleted message, if any. */
export async function getMostRecentPinnedMessage(db: SQLiteDatabase, conversationId: string): Promise<LocalMessage | null> {
  const row = await db.getFirstAsync<LocalMessage>(
    `SELECT * FROM messages WHERE conversation_id = $conversationId AND pinned = 1 AND deleted = 0
     ORDER BY sent_at DESC LIMIT 1`,
    { $conversationId: conversationId }
  );
  return row ?? null;
}

/** Only advances status forward (sending < sent < delivered < read) — never regresses it. */
export async function advanceMessagesStatus(db: SQLiteDatabase, messageIds: string[], status: LocalMessage['status']) {
  if (messageIds.length === 0) return;
  const rank: Record<LocalMessage['status'], number> = { sending: 0, sent: 1, delivered: 2, read: 3 };
  const placeholders = messageIds.map((_, i) => `$id${i}`).join(',');
  const params: Record<string, string> = { $status: status, $rank: String(rank[status]) };
  messageIds.forEach((id, i) => {
    params[`$id${i}`] = id;
  });
  await db.runAsync(
    `UPDATE messages SET status = $status
     WHERE message_id IN (${placeholders})
       AND CASE status WHEN 'sending' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 END < $rank`,
    params
  );
}

export async function getMessageById(db: SQLiteDatabase, messageId: string): Promise<LocalMessage | null> {
  const row = await db.getFirstAsync<LocalMessage>('SELECT * FROM messages WHERE message_id = $messageId', {
    $messageId: messageId,
  });
  return row ?? null;
}

export async function listMessages(db: SQLiteDatabase, conversationId: string): Promise<LocalMessage[]> {
  return db.getAllAsync<LocalMessage>(
    'SELECT * FROM messages WHERE conversation_id = $conversationId AND deleted_for_me = 0 ORDER BY sent_at ASC',
    { $conversationId: conversationId }
  );
}

export async function getUnreadMessageIds(db: SQLiteDatabase, conversationId: string, myUserId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ message_id: string }>(
    `SELECT message_id FROM messages
     WHERE conversation_id = $conversationId AND sender_id <> $myUserId AND status <> 'read'`,
    { $conversationId: conversationId, $myUserId: myUserId }
  );
  return rows.map((r) => r.message_id);
}

export async function listConversations(db: SQLiteDatabase, myUserId: string): Promise<LocalConversation[]> {
  return db.getAllAsync<LocalConversation>(
    `SELECT c.id, c.title, c.last_message_at, c.avatar_object_key, c.is_group, c.is_favorite,
       COALESCE(c.is_muted, 0) AS is_muted,
       COALESCE(c.is_archived, 0) AS is_archived,
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.sender_id <> $myUserId AND m.status <> 'read') AS unread_count,
       (SELECT m2.ciphertext FROM messages m2
         WHERE m2.conversation_id = c.id AND m2.deleted = 0 AND m2.deleted_for_me = 0 AND m2.is_system = 0
         ORDER BY m2.sent_at DESC LIMIT 1) AS last_message_snippet,
       (SELECT m2.media_type FROM messages m2
         WHERE m2.conversation_id = c.id AND m2.deleted = 0 AND m2.deleted_for_me = 0 AND m2.is_system = 0
         ORDER BY m2.sent_at DESC LIMIT 1) AS last_message_type,
       (SELECT m2.sender_id FROM messages m2
         WHERE m2.conversation_id = c.id AND m2.deleted = 0 AND m2.deleted_for_me = 0 AND m2.is_system = 0
         ORDER BY m2.sent_at DESC LIMIT 1) AS last_message_sender_id
     FROM conversations c
     WHERE COALESCE(c.is_archived, 0) = 0
     ORDER BY c.last_message_at DESC`,
    { $myUserId: myUserId }
  );
}

export async function listArchivedConversations(db: SQLiteDatabase, myUserId: string): Promise<LocalConversation[]> {
  return db.getAllAsync<LocalConversation>(
    `SELECT c.id, c.title, c.last_message_at, c.avatar_object_key, c.is_group, c.is_favorite,
       COALESCE(c.is_muted, 0) AS is_muted,
       COALESCE(c.is_archived, 0) AS is_archived,
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.sender_id <> $myUserId AND m.status <> 'read') AS unread_count,
       (SELECT m2.ciphertext FROM messages m2
         WHERE m2.conversation_id = c.id AND m2.deleted = 0 AND m2.deleted_for_me = 0 AND m2.is_system = 0
         ORDER BY m2.sent_at DESC LIMIT 1) AS last_message_snippet,
       (SELECT m2.media_type FROM messages m2
         WHERE m2.conversation_id = c.id AND m2.deleted = 0 AND m2.deleted_for_me = 0 AND m2.is_system = 0
         ORDER BY m2.sent_at DESC LIMIT 1) AS last_message_type,
       (SELECT m2.sender_id FROM messages m2
         WHERE m2.conversation_id = c.id AND m2.deleted = 0 AND m2.deleted_for_me = 0 AND m2.is_system = 0
         ORDER BY m2.sent_at DESC LIMIT 1) AS last_message_sender_id
     FROM conversations c
     WHERE COALESCE(c.is_archived, 0) = 1
     ORDER BY c.last_message_at DESC`,
    { $myUserId: myUserId }
  );
}

export async function getConversationTitle(db: SQLiteDatabase, id: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM conversations WHERE id = $id', { $id: id });
  return row?.title ?? null;
}

export async function upsertConversation(
  db: SQLiteDatabase,
  id: string,
  title: string,
  // null means "don't touch the existing last_message_at" — for calls that
  // are only here to keep title/avatar fresh or make sure the row exists
  // (see the two such call sites in useConversation.ts). Passing the
  // current time for those used to stomp the real last-message timestamp
  // on every single conversation open, which is what made the chat list
  // show "now" instead of when the last message actually went out.
  lastMessageAt: string | null,
  avatarObjectKey?: string | null,
  isGroup = false
) {
  // COALESCE keeps whatever avatar was already stored when this call doesn't
  // know it (e.g. sendMessage upserting just to bump last_message_at) —
  // only an explicitly-passed key overwrites it. is_group is intentionally
  // left out of the UPDATE SET clause below — it's a creation-time fact
  // that never changes, so later calls (which don't know or care) can't
  // accidentally reset it.
  await db.runAsync(
    `INSERT INTO conversations (id, title, last_message_at, avatar_object_key, is_group)
     VALUES ($id, $title, COALESCE($lastMessageAt, $now), $avatarObjectKey, $isGroup)
     ON CONFLICT(id) DO UPDATE SET
       last_message_at = COALESCE($lastMessageAt, conversations.last_message_at),
       title = excluded.title,
       avatar_object_key = COALESCE(excluded.avatar_object_key, conversations.avatar_object_key)`,
    {
      $id: id,
      $title: title,
      $lastMessageAt: lastMessageAt,
      $now: new Date().toISOString(),
      $avatarObjectKey: avatarObjectKey ?? null,
      $isGroup: isGroup ? 1 : 0,
    }
  );
}

/** Bulk-sets the favorite flag for the given conversations (used by the chat list's selection-bar star action). */
export async function setFavorite(db: SQLiteDatabase, conversationIds: string[], favorite: boolean) {
  if (conversationIds.length === 0) return;
  const placeholders = conversationIds.map((_, i) => `$id${i}`).join(',');
  const params: Record<string, string | number> = { $favorite: favorite ? 1 : 0 };
  conversationIds.forEach((id, i) => {
    params[`$id${i}`] = id;
  });
  await db.runAsync(`UPDATE conversations SET is_favorite = $favorite WHERE id IN (${placeholders})`, params);
}

/** Bulk-sets the muted flag for the given conversations. */
export async function setMuted(db: SQLiteDatabase, conversationIds: string[], muted: boolean) {
  if (conversationIds.length === 0) return;
  const placeholders = conversationIds.map((_, i) => `$id${i}`).join(',');
  const params: Record<string, string | number> = { $muted: muted ? 1 : 0 };
  conversationIds.forEach((id, i) => { params[`$id${i}`] = id; });
  await db.runAsync(`UPDATE conversations SET is_muted = $muted WHERE id IN (${placeholders})`, params);
}

/** Bulk-sets the archived flag for the given conversations. */
export async function setArchived(db: SQLiteDatabase, conversationIds: string[], archived: boolean) {
  if (conversationIds.length === 0) return;
  const placeholders = conversationIds.map((_, i) => `$id${i}`).join(',');
  const params: Record<string, string | number> = { $archived: archived ? 1 : 0 };
  conversationIds.forEach((id, i) => { params[`$id${i}`] = id; });
  await db.runAsync(`UPDATE conversations SET is_archived = $archived WHERE id IN (${placeholders})`, params);
}

/** Removes a conversation and its messages from this device only — the server keeps its own copy. */
export async function deleteConversation(db: SQLiteDatabase, conversationId: string) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id = $id', { $id: conversationId });
  await db.runAsync('DELETE FROM conversations WHERE id = $id', { $id: conversationId });
  await db.runAsync('DELETE FROM group_members WHERE group_id = $id', { $id: conversationId });
}

/** "Clear chat" — removes this device's local copy of every message, but keeps the conversation itself (unlike deleteConversation). Purely local: the server keeps its own copy, same as a real device wipe would look to anyone else. */
export async function clearConversationMessages(db: SQLiteDatabase, conversationId: string) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id = $id', { $id: conversationId });
}

export async function upsertGroupMembers(
  db: SQLiteDatabase,
  groupId: string,
  members: Array<{ userId: string; displayName?: string | null; avatarObjectKey?: string | null; role: string }>
) {
  for (const m of members) {
    await db.runAsync(
      `INSERT INTO group_members (group_id, user_id, display_name, avatar_object_key, role)
       VALUES ($groupId, $userId, $displayName, $avatarObjectKey, $role)
       ON CONFLICT(group_id, user_id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, group_members.display_name),
         avatar_object_key = COALESCE(excluded.avatar_object_key, group_members.avatar_object_key),
         role = excluded.role`,
      {
        $groupId: groupId,
        $userId: m.userId,
        $displayName: m.displayName ?? null,
        $avatarObjectKey: m.avatarObjectKey ?? null,
        $role: m.role,
      }
    );
  }
}

export async function listGroupMembers(db: SQLiteDatabase, groupId: string): Promise<LocalGroupMember[]> {
  return db.getAllAsync<LocalGroupMember>('SELECT * FROM group_members WHERE group_id = $groupId', { $groupId: groupId });
}

export async function removeLocalGroupMember(db: SQLiteDatabase, groupId: string, userId: string) {
  await db.runAsync('DELETE FROM group_members WHERE group_id = $groupId AND user_id = $userId', {
    $groupId: groupId,
    $userId: userId,
  });
}

/** Records one group member's own receipt for one message (see ChatController's GroupReceiptUpdate broadcast). */
export async function applyReceipt(db: SQLiteDatabase, messageId: string, userId: string, status: LocalMessage['status']) {
  await db.runAsync(
    `INSERT INTO message_receipts (message_id, user_id, status) VALUES ($messageId, $userId, $status)
     ON CONFLICT(message_id, user_id) DO UPDATE SET status = excluded.status`,
    { $messageId: messageId, $userId: userId, $status: status }
  );
}

/** Per-member receipt breakdown for one group message — the "message info" / read-by view. */
export async function getReceiptsForMessage(db: SQLiteDatabase, messageId: string): Promise<Array<{ user_id: string; status: string }>> {
  return db.getAllAsync<{ user_id: string; status: string }>(
    'SELECT user_id, status FROM message_receipts WHERE message_id = $messageId',
    { $messageId: messageId }
  );
}

/**
 * Group messages have no single Message.status from the server — each
 * member has their own receipt row instead (see applyReceipt). This
 * aggregates all of them back into the same messages.status column the
 * existing tick UI (MessageTicks, advanceMessagesStatus) already renders
 * from, so nothing UI-side needs to know groups work any differently:
 * "delivered" once every other member has at least delivered, "read" once
 * every other member has read, "sent" otherwise.
 */
export async function recomputeGroupMessageStatus(db: SQLiteDatabase, messageId: string, groupId: string) {
  const messageRow = await db.getFirstAsync<{ sender_id: string }>(
    'SELECT sender_id FROM messages WHERE message_id = $messageId',
    { $messageId: messageId }
  );
  if (!messageRow) return;
  const members = await db.getAllAsync<{ user_id: string }>(
    'SELECT user_id FROM group_members WHERE group_id = $groupId AND user_id <> $senderId',
    { $groupId: groupId, $senderId: messageRow.sender_id }
  );
  if (members.length === 0) return;

  const receipts = await db.getAllAsync<{ user_id: string; status: string }>(
    'SELECT user_id, status FROM message_receipts WHERE message_id = $messageId',
    { $messageId: messageId }
  );
  const receiptByUser = new Map(receipts.map((r) => [r.user_id, r.status]));
  const rank: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };
  let minRank = rank.read;
  for (const member of members) {
    const status = receiptByUser.get(member.user_id) ?? 'sent';
    minRank = Math.min(minRank, rank[status] ?? rank.sent);
  }
  const aggregate = (Object.keys(rank) as LocalMessage['status'][]).find((s) => rank[s] === minRank) ?? 'sent';
  await db.runAsync('UPDATE messages SET status = $status WHERE message_id = $messageId', {
    $status: aggregate,
    $messageId: messageId,
  });
}

// ---------------------------------------------------------------------------
// Local contact name overrides (WhatsApp-style: your saved name wins)
// ---------------------------------------------------------------------------

export type LocalContact = {
  user_id: string;
  local_name: string;
};

/** Saves (or updates) the name this device's user has chosen for a given userId. */
export async function upsertLocalContact(db: SQLiteDatabase, userId: string, localName: string) {
  await db.runAsync(
    `INSERT INTO local_contacts (user_id, local_name) VALUES ($userId, $localName)
     ON CONFLICT(user_id) DO UPDATE SET local_name = excluded.local_name`,
    { $userId: userId, $localName: localName }
  );
}

/** Returns the locally-saved name for a userId, or null if none has been saved. */
export async function getLocalContactName(db: SQLiteDatabase, userId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ local_name: string }>(
    'SELECT local_name FROM local_contacts WHERE user_id = $userId',
    { $userId: userId }
  );
  return row?.local_name ?? null;
}

/** Bulk-fetches all local contact overrides as a Map<userId, localName>. */
export async function getAllLocalContacts(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<LocalContact>('SELECT user_id, local_name FROM local_contacts');
  return new Map(rows.map((r) => [r.user_id, r.local_name]));
}

// ---------------------------------------------------------------------------
// Starred messages (device-local only — WhatsApp's own star is private to
// the starring device too, never visible to or synced with anyone else)
// ---------------------------------------------------------------------------

/** Persists a star so it survives an app restart — previously an in-memory useState Set that reset to empty every time the thread screen remounted. */
export async function starMessage(db: SQLiteDatabase, messageId: string) {
  await db.runAsync(
    `INSERT INTO starred_message (message_id, starred_at) VALUES ($messageId, $starredAt)
     ON CONFLICT(message_id) DO NOTHING`,
    { $messageId: messageId, $starredAt: new Date().toISOString() }
  );
}

export async function unstarMessage(db: SQLiteDatabase, messageId: string) {
  await db.runAsync('DELETE FROM starred_message WHERE message_id = $messageId', { $messageId: messageId });
}

/** All starred messageIds for this conversation, loaded once when the thread screen opens. */
export async function getStarredMessageIds(db: SQLiteDatabase, conversationId: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ message_id: string }>(
    `SELECT sm.message_id FROM starred_message sm
     JOIN messages m ON m.message_id = sm.message_id
     WHERE m.conversation_id = $conversationId`,
    { $conversationId: conversationId }
  );
  return new Set(rows.map((r) => r.message_id));
}

// ---------------------------------------------------------------------------
// Message reactions (server-synced — see backend's ChatController#react and
// MessageHistoryController#reactions; this is just this device's local
// cache, refreshed on thread open and kept live via STOMP)
// ---------------------------------------------------------------------------

export type LocalReaction = { message_id: string; user_id: string; emoji: string };

/** Replaces this device's whole reaction cache for a conversation with the server's current state — called once when a thread opens. */
export async function replaceReactionsForConversation(db: SQLiteDatabase, conversationId: string, reactions: LocalReaction[]) {
  const messageIds = await db.getAllAsync<{ message_id: string }>(
    'SELECT message_id FROM messages WHERE conversation_id = $conversationId',
    { $conversationId: conversationId }
  );
  const ids = messageIds.map((r) => r.message_id);
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `$id${i}`).join(',');
    const params: Record<string, string> = {};
    ids.forEach((id, i) => { params[`$id${i}`] = id; });
    await db.runAsync(`DELETE FROM message_reactions WHERE message_id IN (${placeholders})`, params);
  }
  for (const r of reactions) {
    await db.runAsync(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($messageId, $userId, $emoji)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`,
      { $messageId: r.message_id, $userId: r.user_id, $emoji: r.emoji }
    );
  }
}

/** Applies one live reaction update (see ChatController#react's broadcast) — emoji=null removes it. */
export async function applyReactionUpdate(db: SQLiteDatabase, messageId: string, userId: string, emoji: string | null) {
  if (emoji) {
    await db.runAsync(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($messageId, $userId, $emoji)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`,
      { $messageId: messageId, $userId: userId, $emoji: emoji }
    );
  } else {
    await db.runAsync('DELETE FROM message_reactions WHERE message_id = $messageId AND user_id = $userId', {
      $messageId: messageId,
      $userId: userId,
    });
  }
}

/** Map<messageId, Map<userId, emoji>> for every reaction in this conversation. */
export async function getReactionsForConversation(db: SQLiteDatabase, conversationId: string): Promise<Map<string, Map<string, string>>> {
  const rows = await db.getAllAsync<LocalReaction>(
    `SELECT r.message_id, r.user_id, r.emoji FROM message_reactions r
     JOIN messages m ON m.message_id = r.message_id
     WHERE m.conversation_id = $conversationId`,
    { $conversationId: conversationId }
  );
  const byMessage = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!byMessage.has(r.message_id)) byMessage.set(r.message_id, new Map());
    byMessage.get(r.message_id)!.set(r.user_id, r.emoji);
  }
  return byMessage;
}

/** Local cache of this conversation's disappearing-messages duration, kept current from ConversationController's sync (server-authoritative — see ConversationSummary.disappearingMessageSeconds) and the live .settings STOMP topic. */
export async function setDisappearingSeconds(db: SQLiteDatabase, conversationId: string, seconds: number | null) {
  await db.runAsync('UPDATE conversations SET disappearing_message_seconds = $seconds WHERE id = $id', {
    $seconds: seconds,
    $id: conversationId,
  });
}

export async function getDisappearingSeconds(db: SQLiteDatabase, conversationId: string): Promise<number | null> {
  const row = await db.getFirstAsync<{ disappearing_message_seconds: number | null }>(
    'SELECT disappearing_message_seconds FROM conversations WHERE id = $id',
    { $id: conversationId }
  );
  return row?.disappearing_message_seconds ?? null;
}

// ---------------------------------------------------------------------------
// Known-matched-contacts tracking (feeds the "X is now on RiskyC Chat"
// join notification — see features/contacts/sync.ts)
// ---------------------------------------------------------------------------

export async function getKnownMatchedContactIds(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ user_id: string }>('SELECT user_id FROM known_matched_contacts');
  return new Set(rows.map((r) => r.user_id));
}

export async function markContactsAsKnown(db: SQLiteDatabase, userIds: string[]) {
  const now = new Date().toISOString();
  for (const userId of userIds) {
    await db.runAsync(
      'INSERT INTO known_matched_contacts (user_id, matched_at) VALUES ($userId, $matchedAt) ON CONFLICT(user_id) DO NOTHING',
      { $userId: userId, $matchedAt: now }
    );
  }
}

/** Convenience re-export so feature modules only import from one place. */
export { useSQLiteContext };
