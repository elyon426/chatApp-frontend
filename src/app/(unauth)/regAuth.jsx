import * as Application from 'expo-application';
import * as Contacts from 'expo-contacts/legacy'; // Added for direct address book access
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';

// SecureStore Storage Keys
const DEVICE_ID_KEY = 'secure_device_uuid';
const USER_ID_KEY = 'secure_user_id';
const PLAIN_TOKEN_KEY = 'secure_plain_token';
const SERVER = 'https://chatapp-backend-m6bp.onrender.com';

export default function RegistrationScreen() {
  const { refreshSession } = useAuth();
  const [db, setDb] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [appReady, setAppReady] = useState(false);

  // 1. LIFECYCLE INITIALIZATION: Prepares Device Identity and Both SQLite Tables
  useEffect(() => {
    async function initializeAppEngine() {
      try {
        // --- A. Resolve Device Identity ---
        let savedId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
        if (!savedId) {
          if (Platform.OS === 'android') savedId = Application.getAndroidId();
          else if (Platform.OS === 'ios') savedId = await Application.getIosIdForVendorAsync();
          
          if (!savedId) savedId = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await SecureStore.setItemAsync(DEVICE_ID_KEY, savedId);
        }
        setDeviceId(savedId);

        // --- B. Initialize Database and Schema Tables ---
        const database = await SQLite.openDatabaseAsync('chat_app.db');
        setDb(database);

        // Execute initialization rules for both user profile mapping tables
        await database.execAsync(`
          PRAGMA journal_mode = WAL;
          
          CREATE TABLE IF NOT EXISTS session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            plain_token TEXT NOT NULL,
            device_id TEXT NOT NULL,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS app_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL
          );
        `);

      } catch (error) {
        console.error("Initialization engine failure:", error);
        Alert.alert("Initialization Error", "Failed to resolve system background storage.");
      } finally {
        setAppReady(true);
      }
    }

    initializeAppEngine();
  }, []);

  // 2. CONTACT SYNCHRONIZATION PIPELINE
const runAddressBookSync = async (databaseInstance) => {
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Address book read permissions were denied by user.');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });
    if (!data || data.length === 0) return;

    // clean phone number -> the name saved in the user's phone book.
    // Keys are unique, so this also removes duplicate numbers.
    const nameByPhone = new Map();
    for (const contact of data) {
      for (const p of contact.phoneNumbers ?? []) {
        if (!p.number) continue;
        const phone = cleanNumber(p.number);
        if (!nameByPhone.has(phone)) {
          nameByPhone.set(phone, contact.name || 'No Name');
        }
      }
    }
    if (nameByPhone.size === 0) return;

    const response = await fetch(`${SERVER}/api/auth/sync-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers: [...nameByPhone.keys()] }),
    });

    if (!response.ok) {
      console.log('Contact sync rejected by server:', response.status);
      return;
    }

    const { matches } = await response.json();

    for (const m of matches ?? []) {
      // Prefer the name from the phone book, fall back to the app username
      const displayName = nameByPhone.get(cleanNumber(m.phone_number)) || m.username;

      // INSERT OR IGNORE keeps any existing local name
      await databaseInstance.runAsync(
        'INSERT OR IGNORE INTO app_users (user_id, name, phone) VALUES (?, ?, ?)',
        [String(m.user_id), String(displayName), String(m.phone_number)]
      );
    }
    console.log(`Cached ${matches?.length ?? 0} app contacts.`);
  } catch (err) {
    console.error('Background data sync pipeline tracking failure:', err);
  }
};

  // 3. MAIN FORM REGISTRATION ACTION SUBMIT PIPELINE
  const handleValidateAndSubmit = async () => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedPhone = phoneNumber.trim();

    if (!trimmedFirst || !trimmedLast || !trimmedPhone) {
      Alert.alert('Validation Error', 'All fields are required.');
      return;
    }

    const phoneRegex = /^\+?[0-9\s\-]{7,15}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      Alert.alert('Validation Error', 'Please enter a valid phone number.');
      return;
    }

    if (!deviceId || !db) {
      Alert.alert('System Error', 'System engines are initializing. Please wait a moment.');
      return;
    }

    const fullName = `${trimmedFirst} ${trimmedLast}`;
    const payload = { userName: fullName, phoneNumber: trimmedPhone, deviceId };
    setLoading(true);

    try {
      const response = await fetch('https://chatapp-backend-m6bp.onrender.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      

      if (response.ok) {
        const data = await response.json();
        
        const userId = data.userId ; 
        const plainToken = data.plainToken;

        // A. Store credentials securely inside Keychain hardware memory layers
        await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
        await SecureStore.setItemAsync(PLAIN_TOKEN_KEY, String(plainToken));

        // B. Seed personal login info inside local session table layout
        await db.runAsync(
          'INSERT OR REPLACE INTO session (user_id, plain_token, device_id, full_name, phone) VALUES (?, ?, ?, ?, ?)',
          [String(userId), String(plainToken), String(deviceId), fullName, trimmedPhone]
        );

        // C. EXECUTE THE CONTACT SYNC ENGINE (Direct sequential runtime trigger)
        await runAddressBookSync(db);

        Alert.alert(
          'Success', 
          `Account verified!\nYour contacts are ready and your local session is safe.`,
          [
            { 
              text: 'Open App', 
              onPress: async () => {
                setFirstName('');
                setLastName('');
                setPhoneNumber('');

                // Re-read the stored token so the root layout's route guard flips
                // to authenticated and moves the user to the chats list
                await refreshSession();
              }
            }
          ]
        );
      } else {
        throw new Error('Database server rejected registration transaction.');
      }
    } catch (error) {
      Alert.alert('Network Failure', error.message || 'Could not register user to DB.');
    } finally {
      setLoading(false);
    }
  };

  if (!appReady) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Secure Registration</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>First Name</Text>
        <TextInput style={styles.input} placeholder="John" placeholderTextColor="#999" value={firstName} onChangeText={setFirstName} />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} placeholder="Doe" placeholderTextColor="#999" value={lastName} onChangeText={setLastName} />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Phone Number</Text>
        <TextInput style={styles.input} placeholder="+1234567890" placeholderTextColor="#999" keyboardType="phone-pad" value={phoneNumber} onChangeText={setPhoneNumber} />
      </View>

      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleValidateAndSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register Account</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  container: { flexGrow: 1, backgroundColor: '#f8f9fa', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#212529' },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#495057', marginBottom: 6 },
  input: { height: 50, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: '#dee2e6', fontSize: 16, color: '#212529' },
  button: { backgroundColor: '#007AFF', height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 10, marginTop: 25 },
  buttonDisabled: { backgroundColor: '#a2cbff' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
