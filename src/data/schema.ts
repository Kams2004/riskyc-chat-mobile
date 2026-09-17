import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local-first schema: every message is written here immediately (optimistic
 * UI) and reconciled with the server via messageId. This is the client-side
 * half of the "local-first sync" approach from the architecture proposal —
 * the UI always reads from SQLite, never waits on the network round trip.
 */
const CURRENT_VERSION = 11;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        last_message_at TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sending'
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages (conversation_id, sent_at);
    `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync(`ALTER TABLE conversations ADD COLUMN avatar_object_key TEXT;`);
    version = 2;
  }

  if (version === 2) {
    await db.execAsync(`
      ALTER TABLE messages ADD COLUMN media_type TEXT;
      ALTER TABLE messages ADD COLUMN media_object_key TEXT;
      ALTER TABLE messages ADD COLUMN media_file_name TEXT;
      ALTER TABLE messages ADD COLUMN media_duration_ms INTEGER;
      ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
    `);
    version = 3;
  }

  if (version === 3) {
    await db.execAsync(`
      ALTER TABLE conversations ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE conversations ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT,
        avatar_object_key TEXT,
        role TEXT NOT NULL,
        PRIMARY KEY (group_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS message_receipts (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      );
    `);
    version = 4;
  }

  if (version === 4) {
    await db.execAsync(`
      ALTER TABLE messages ADD COLUMN forwarded INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE messages ADD COLUMN deleted_for_me INTEGER NOT NULL DEFAULT 0;
    `);
    version = 5;
  }

  if (version === 5) {
    // JSON-serialized AttachmentItem[] (see db.ts) for a multi-image/video
    // gallery send — a plain TEXT column rather than a child table (unlike
    // the server's message_attachment table) since this is read-only
    // display data on the client, not something ever queried/filtered by
    // attachment fields individually.
    await db.execAsync(`ALTER TABLE messages ADD COLUMN attachments_json TEXT;`);
    version = 6;
  }

  if (version === 6) {
    // Reply-to fields are denormalized straight onto the message row (see
    // Message.java's own comment) — generated client-side at send time so a
    // "reply privately" recipient, whose local DB never had the original
    // conversation synced, still has enough to render the quote. `pinned`
    // is a single shared per-conversation flag, not a separate table.
    await db.execAsync(`
      ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT;
      ALTER TABLE messages ADD COLUMN reply_to_conversation_id TEXT;
      ALTER TABLE messages ADD COLUMN reply_to_sender_id TEXT;
      ALTER TABLE messages ADD COLUMN reply_to_snippet TEXT;
      ALTER TABLE messages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
    `);
    version = 7;
  }

  if (version === 7) {
    // Local contact name overrides — stores the name the current user saved
    // for a given userId in their device contacts (or manually inside the
    // app). This is purely local and never synced to the server, mirroring
    // WhatsApp's behaviour where your saved name takes precedence over the
    // name the other person registered with.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_contacts (
        user_id TEXT PRIMARY KEY NOT NULL,
        local_name TEXT NOT NULL
      );
    `);
    version = 8;
  }

  if (version === 8) {
    await db.execAsync(`
      ALTER TABLE conversations ADD COLUMN is_muted INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE conversations ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
    `);
    version = 9;
  }

  if (version === 9) {
    // Starred: device-local only, never synced (see db.ts's starMessage doc
    // comment). Reactions: server-synced and broadcast live, this table is
    // just this device's cache of the last-known state, refreshed on thread
    // open and kept current by the live STOMP subscription. expires_at /
    // disappearing_message_seconds mirror the server's own Message.expiresAt
    // and ConversationSummary.disappearingMessageSeconds.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS starred_message (
        message_id TEXT PRIMARY KEY NOT NULL,
        starred_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      );

      ALTER TABLE messages ADD COLUMN expires_at TEXT;
      ALTER TABLE conversations ADD COLUMN disappearing_message_seconds INTEGER;
    `);
    version = 10;
  }

  if (version === 10) {
    // Tracks every contact this device has EVER seen matched to an account —
    // independent of local_contacts (which only has an entry when a device
    // name exists) — purely so a background sync can tell "matched before"
    // apart from "just joined" and fire a one-time notification for the
    // latter (see features/contacts/sync.ts).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS known_matched_contacts (
        user_id TEXT PRIMARY KEY NOT NULL,
        matched_at TEXT NOT NULL
      );
    `);
    version = 11;
  }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_VERSION}`);
}
