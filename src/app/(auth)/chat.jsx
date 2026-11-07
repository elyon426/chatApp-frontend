import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureMessagesTable, getDb, loadMessages, loadPendingMessages, makeMessageId, saveMessage, setMessageStatus } from '../../db/messages';
import { sameId } from '../../utils/normalize';

export default function IndividualChatScreen() {
  const { contactId, contactName } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets(); // status bar / gesture bar / 3-button nav bar heights
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [myUserId, setMyUserId] = useState(null);
  const [connected, setConnected] = useState(false);

  // Use refs to persist socket and timers across re-renders
  const socketRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const dbRef = useRef(null);
  const myIdRef = useRef(null);

  const updateStatusInState = (messageId, status) =>
    setMessages((prev) => prev.map((m) => (m.message_id === messageId ? { ...m, status } : m)));

  // Send one stored message over the socket if it is open. Otherwise it stays 'pending'.
  const sendOverSocket = (msg) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    // The server expects: messageId, targetId, content (and optional mediaUrl)
    ws.send(JSON.stringify({
      messageId: msg.message_id,
      targetId: String(contactId),
      content: msg.content,
      mediaUrl: msg.media_url,
    }));
    return true;
  };

  // 1. Load saved history first, then connect the socket
  useEffect(() => {
    let active = true;

    async function initializeChatSession() {
      const savedUid = await SecureStore.getItemAsync('secure_user_id');
      const token = await SecureStore.getItemAsync('secure_plain_token');
      if (!active) return;
      myIdRef.current = savedUid;
      setMyUserId(savedUid);

      // Local history: works offline and survives closing the app
      const db = await getDb();
      dbRef.current = db;
      await ensureMessagesTable(db);
      const history = await loadMessages(db, contactId);
      if (!active) return;
      setMessages(history);

      const wsUrl = `wss://chat-server-docker-fy2r.onrender.com?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = async () => {
        setConnected(true);

        // Resend anything that was written while offline
        const pending = await loadPendingMessages(db, contactId);
        pending.forEach((m) => sendOverSocket(m));

        // Keep the socket alive (the server ignores empty frames)
        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({}));
        }, 30000);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data || Object.keys(data).length === 0) return;

          // Server confirmations for messages I sent
          if (data.status === 'msg_ack' || data.status === 'cached_offline') {
            await setMessageStatus(db, data.messageId, 'sent');
            updateStatusInState(data.messageId, 'sent');
            return;
          }

          if (data.type === 'AUTH_ERROR') {
            console.error('Chat server rejected the token:', data.error);
            return;
          }
          if (data.type) return; // AUTH_SUCCESS and other control frames

          // An incoming message. Save ALL of them (including ones from other
          // contacts delivered from the offline inbox), show only this chat's.
          if (data.messageId && data.senderId && (data.content || data.mediaUrl)) {
            const incoming = {
              message_id: String(data.messageId),
              contact_id: String(data.senderId),
              sender_id: String(data.senderId),
              content: data.content ?? null,
              media_url: data.mediaUrl ?? null,
              timestamp: data.timestamp || new Date().toISOString(),
              status: 'received',
            };
            await saveMessage(db, incoming);
            if (sameId(incoming.contact_id, contactId)) {
              setMessages((prev) =>
                prev.some((m) => m.message_id === incoming.message_id) ? prev : [incoming, ...prev]
              );
            }
          }
        } catch (err) {
          console.error('Error handling incoming packet:', err);
        }
      };

      ws.onerror = (error) => console.error('WebSocket error:', error);
      ws.onclose = () => {
        setConnected(false);
        clearInterval(heartbeatTimerRef.current);
      };
    }

    initializeChatSession().catch((err) => console.error('Chat init failed:', err));

    return () => {
      active = false;
      if (socketRef.current) socketRef.current.close();
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [contactId]);

  // 2. Send: save locally FIRST, then try the network
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !myIdRef.current || !dbRef.current) return;

    const msg = {
      message_id: makeMessageId(),
      contact_id: String(contactId),
      sender_id: String(myIdRef.current),
      content: text,
      media_url: null,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    setInputText('');
    setMessages((prev) => [msg, ...prev]);
    await saveMessage(dbRef.current, msg);
    sendOverSocket(msg); // if offline it stays 'pending' and is resent on reconnect
  };

  return (
    <KeyboardAvoidingView 
      // 'padding' works on both platforms now that Android is edge-to-edge.
      // The stack header is hidden for this screen, so no offset is needed.
      behavior="padding"
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{contactName || 'Chat Room'}</Text>
        <Text style={[styles.statusText, connected ? styles.online : styles.offline]}>
          {connected ? '● connected' : '○ connecting...'}
        </Text>
      </View>

      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.message_id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isMe = sameId(item.sender_id, myUserId);
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.msgText, isMe ? styles.textMe : styles.textThem]}>
                {item.content}
              </Text>
              {isMe && (
                <Text style={styles.tick}>
                  {item.status === 'pending' ? '🕓' : item.status === 'failed' ? '!' : '✓'}
                </Text>
              )}
            </View>
          );
        }}
      />

      <View style={[styles.inputBar, { paddingBottom: 10 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Type message..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          returnKeyType="send"
          onSubmitEditing={handleSendMessage}
          blurOnSubmit={false}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage} hitSlop={8}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e0e0e0', alignItems: 'center' },
  backText: { color: '#007AFF', fontSize: 17 },
  backBtn: { position: 'absolute', left: 14, bottom: 14 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#212529' },
  statusText: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  online: { color: '#4CD964' },
  offline: { color: '#FF3B30' },
  listContent: { paddingHorizontal: 14, paddingVertical: 12 },
  bubble: { maxWidth: '75%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8 },
  bubbleMe: { backgroundColor: '#007AFF', alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  bubbleThem: { backgroundColor: '#e9ecef', alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  msgText: { fontSize: 15, lineHeight: 20 },
  tick: { color: '#cfe3ff', fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  textMe: { color: '#fff' },
  textThem: { color: '#212529' },
  inputBar: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff', gap: 12, alignItems: 'center', borderTopWidth: 1, borderColor: '#eee' },
  input: { flex: 1, height: 40, backgroundColor: '#f1f3f5', borderRadius: 20, paddingHorizontal: 16, fontSize: 15, color: '#212529' },
  sendBtn: { paddingHorizontal: 8 },
  sendText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 }
});
