import * as Contacts from 'expo-contacts/legacy';
import { normalizePhone } from '../utils/normalize';

// Re-exported so existing imports keep working
export { normalizePhone };

const SERVER = 'https://chatapp-backend-m6bp.onrender.com';

/** Create the local tables if they don't exist yet (safe to call repeatedly). */
export async function ensureTables(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );
  `);
}

/**
 * Reads the phone's address book, asks the server which numbers have accounts,
 * and caches the matches in SQLite. Returns the number of matches.
 */
export async function syncAddressBook(db) {
  await ensureTables(db);

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return 0;

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });
  if (!data?.length) return 0;

  // phone (E.164) -> name saved in the user's address book
  const nameByPhone = new Map();
  for (const contact of data) {
    for (const p of contact.phoneNumbers ?? []) {
      const phone = normalizePhone(p.number);
      if (!phone) continue; // skip short codes / junk numbers
      if (!nameByPhone.has(phone)) nameByPhone.set(phone, contact.name || 'No Name');
    }
  }
  if (nameByPhone.size === 0) return 0;

  const res = await fetch(`${SERVER}/api/auth/sync-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumbers: [...nameByPhone.keys()] }),
  });
  if (!res.ok) throw new Error(`Contact sync failed (${res.status})`);

  const { matches } = await res.json();
  for (const m of matches ?? []) {
    const phone = normalizePhone(m.phone_number);
    if (!phone) continue;
    // Upsert so names/phones from older, differently-formatted saves get fixed
    await db.runAsync(
      `INSERT INTO app_users (user_id, name, phone) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, phone = excluded.phone`,
      [String(m.user_id), String(nameByPhone.get(phone) || m.username), phone]
    );
  }
  return matches?.length ?? 0;
}
