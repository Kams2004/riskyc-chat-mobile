import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'riskyc.db';

export type MediaType = 'IMAGE' | 'FILE' | 'AUDIO' | 'CALL';

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
  // SQLite hands INTEGER columns back as 0|1, not real booleans — truthy
  // checks in the UI work fine either way, so this is left as-is rather
  // than converted.
  edited: number;
  deleted: number;
};

export type LocalConversation = {
  id: string;
  title: string;
  last_message_at: string | null;
  avatar_object_key: string | null;
  unread_count: number;
  is_group: number;
  is_favorite: number;
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
       media_type, media_object_key, media_file_name, media_duration_ms, edited, deleted)
     VALUES ($messageId, $conversationId, $senderId, $recipientId, $ciphertext, $sentAt, $status,
       $mediaType, $mediaObjectKey, $mediaFileName, $mediaDurationMs, $edited, $deleted)
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
      $edited: message.edited,
      $deleted: message.deleted,
    }
  );
}

/** Applies a synced edit/delete from the message's own sender — authoritative, no ordinal guard needed. */
export async function applyMessageMutation(
  db: SQLiteDatabase,
  messageId: string,
  mutation: { ciphertext: string | null; edited: boolean; deleted: boolean }
) {
  await db.runAsync(
    `UPDATE messages SET
       ciphertext = COALESCE($ciphertext, ciphertext),
       edited = $edited,
       deleted = $deleted
     WHERE message_id = $messageId`,
    {
      $messageId: messageId,
      $ciphertext: mutation.ciphertext,
      $edited: mutation.edited ? 1 : 0,
      $deleted: mutation.deleted ? 1 : 0,
    }
  );
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

export async function listMessages(db: SQLiteDatabase, conversationId: string): Promise<LocalMessage[]> {
  return db.getAllAsync<LocalMessage>(
    'SELECT * FROM messages WHERE conversation_id = $conversationId ORDER BY sent_at ASC',
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
    // sender_id <> me (not recipient_id = me): a 1:1 message row's
    // recipient_id is always "whichever of the two isn't the sender", so
    // this is equivalent there, and it's the only version that also works
    // for a group message, which has no single recipient_id to match on.
    `SELECT c.id, c.title, c.last_message_at, c.avatar_object_key, c.is_group, c.is_favorite,
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.sender_id <> $myUserId AND m.status <> 'read') AS unread_count
     FROM conversations c
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
  lastMessageAt: string,
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
     VALUES ($id, $title, $lastMessageAt, $avatarObjectKey, $isGroup)
     ON CONFLICT(id) DO UPDATE SET
       last_message_at = excluded.last_message_at,
       title = excluded.title,
       avatar_object_key = COALESCE(excluded.avatar_object_key, conversations.avatar_object_key)`,
    { $id: id, $title: title, $lastMessageAt: lastMessageAt, $avatarObjectKey: avatarObjectKey ?? null, $isGroup: isGroup ? 1 : 0 }
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

/** Removes a conversation and its messages from this device only — the server keeps its own copy. */
export async function deleteConversation(db: SQLiteDatabase, conversationId: string) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id = $id', { $id: conversationId });
  await db.runAsync('DELETE FROM conversations WHERE id = $id', { $id: conversationId });
  await db.runAsync('DELETE FROM group_members WHERE group_id = $id', { $id: conversationId });
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

/** Convenience re-export so feature modules only import from one place. */
export { useSQLiteContext };
