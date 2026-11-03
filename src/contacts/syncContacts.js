import * as Contacts from 'expo-contacts/legacy';

const SERVER = 'https://chatapp-backend-m6bp.onrender.com';
const DEFAULT_CC = '254'; // Kenya

export function normalizePhone(raw) {
  let n = String(raw).replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('+')) return n;                                   // +254712345678
  if (n.startsWith(DEFAULT_CC) && n.length >= 12) return '+' + n;    // 254712345678
  if (n.startsWith('0')) return '+' + DEFAULT_CC + n.slice(1);       // 0712345678
  if (n.length === 9) return '+' + DEFAULT_CC + n;                   // 712345678
  return '+' + n;
}

export async function syncAddressBook(db) {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return 0;

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });
  if (!data?.length) return 0;

  const nameByPhone = new Map();
  for (const contact of data) {
    for (const p of contact.phoneNumbers ?? []) {
      if (!p.number) continue;
      const phone = normalizePhone(p.number);
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
    await db.runAsync(
      'INSERT OR IGNORE INTO app_users (user_id, name, phone) VALUES (?, ?, ?)',
      [String(m.user_id), String(nameByPhone.get(phone) || m.username), phone]
    );
  }
  return matches?.length ?? 0;
}
