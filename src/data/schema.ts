import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local-first schema: every message is written here immediately (optimistic
 * UI) and reconciled with the server via messageId. This is the client-side
 * half of the "local-first sync" approach from the architecture proposal —
 * the UI always reads from SQLite, never waits on the network round trip.
 */
const CURRENT_VERSION = 4;

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

  // Future schema changes: `if (version === 4) { ...; version = 5; }` and so on.

  await db.execAsync(`PRAGMA user_version = ${CURRENT_VERSION}`);
}
