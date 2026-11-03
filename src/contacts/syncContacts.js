import { syncAddressBook } from '../../contacts/syncContacts';
import { useRouter } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ChatsListScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Core database fetching function
  const fetchLocalVerifiedContacts = async () => {
    try {
      const db = await SQLite.openDatabaseAsync('chat_app.db');
      const cachedUsers = await db.getAllAsync('SELECT * FROM app_users ORDER BY name ASC');
      setContacts(cachedUsers);
    } catch (error) {
      console.error("Local DB fetch failure:", error);
      Alert.alert('Storage Error', 'Could not read local verified contacts.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Pull-to-refresh synchronization logic (shared with registration)
  const handlePullToRefresh = async () => {
    setRefreshing(true);
    try {
      const db = await SQLite.openDatabaseAsync('chat_app.db');
      await syncAddressBook(db);
    } catch (err) {
      console.error('Refresh sync error:', err);
    } finally {
      // Re-read local records to pull fresh entries into state, then end animations
      await fetchLocalVerifiedContacts();
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLocalVerifiedContacts();
  }, []);

  const handleSelectContact = (contact) => {
    router.push({
      pathname: '/(auth)/chat',
      params: { contactId: contact.user_id, contactName: contact.name }
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
      </View>

      {contacts.length > 0 ? (
        <FlatList
          data={contacts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContainer}
          // Attach pull-to-refresh listener attributes
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handlePullToRefresh} 
              colors={['#007AFF']} // Android loading color
              tintColor="#007AFF" // iOS loading color
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleSelectContact(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phoneSubtext}>{item.phone}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        /* Native ScrollView wrapper inside FlatList enables pull-to-refresh even when empty */
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handlePullToRefresh} tintColor="#007AFF" colors={['#007AFF']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.svgWrapper}>
                <Users size={80} color="#b1b5b9" strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>No Contacts Found</Text>
              <Text style={styles.emptyDescription}>
                None of your phone contacts have accounts yet. Pull down on this screen to refresh and check for new updates!
              </Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#212529' },
  listContainer: { paddingVertical: 10 },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, marginBottom: 1, alignItems: 'center', gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#212529' },
  phoneSubtext: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingTop: 100 },
  svgWrapper: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#e9ecef', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#495057', marginBottom: 8 },
  emptyDescription: { fontSize: 14, color: '#6c757d', textAlign: 'center', lineHeight: 20 },
});
