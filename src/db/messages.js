import * as SQLite from 'expo-sqlite';

// One shared connection to the same database file the rest of the app uses
let dbPromise = null;
export function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('chat_app.db');
  return dbPromise;
}

/** UUID-shaped id generated on the phone so retries can't create duplicates. */
export function makeMessageId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function ensureMessagesTable(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,   -- the other person in the conversation
      sender_id  TEXT NOT NULL,   -- who wrote it (me or the contact)
      content    TEXT,
      media_url  TEXT,
      timestamp  TEXT NOT NULL,   -- ISO string
      status     TEXT NOT NULL    -- pending | sent | failed | received
    );
    CREATE INDEX IF NOT EXISTS idx_messages_contact_time ON messages(contact_id, timestamp);
  `);
}

/** Ignores a message we already have, so duplicate deliveries are harmless. */
export async function saveMessage(db, m) {
  await db.runAsync(
    `INSERT OR IGNORE INTO messages (message_id, contact_id, sender_id, content, media_url, timestamp, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [m.message_id, m.contact_id, m.sender_id, m.content ?? null, m.media_url ?? null, m.timestamp, m.status]
  );
}

export async function setMessageStatus(db, messageId, status) {
  await db.runAsync('UPDATE messages SET status = ? WHERE message_id = ?', [status, messageId]);
}

/** Newest first, which is what an inverted FlatList wants. */
export async function loadMessages(db, contactId, limit = 300) {
  return db.getAllAsync(
    'SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp DESC LIMIT ?',
    [String(contactId), limit]
  );
}

/** Messages I wrote that the server has not confirmed yet, oldest first. */
export async function loadPendingMessages(db, contactId) {
  return db.getAllAsync(
    "SELECT * FROM messages WHERE contact_id = ? AND status = 'pending' ORDER BY timestamp ASC",
    [String(contactId)]
  );
}
