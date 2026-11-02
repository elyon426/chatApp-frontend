import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function IndividualChatScreen() {
  const { contactId, contactName } = useLocalSearchParams();
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [myUserId, setMyUserId] = useState(null);
  const [connected, setConnected] = useState(false);

  // Use refs to persist socket and timers across re-renders
  const socketRef = useRef(null);
  const heartbeatTimerRef = useRef(null);

  // 1. Establish User Identity & Initialize WebSockets
  useEffect(() => {
    let active = true;

    async function initializeChatSession() {
      const savedUid = await SecureStore.getItemAsync('secure_user_id');
      const token = await SecureStore.getItemAsync('secure_plain_token');
      
      if (!active) return;
      setMyUserId(savedUid || 'me');

      // Connect to your WebSocket endpoint (passing token via query string if required)
      const wsUrl = `wss://://your-chat-server.com{token}&userId=${savedUid}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket Connected successfully.');
        setConnected(true);

        // --- HEARTBEAT TIMEOUT GUARD ---
        // Every 30 seconds, send an empty JSON object to keep the socket alive
        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({})); 
            console.log('Heartbeat ping sent.');
          }
        }, 30000); 
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Check if payload is an acknowledgment, empty heartbeat, or valid message
          if (!data || Object.keys(data).length === 0) return;

          // Handle array of backlogged offline messages or a single text object
          if (Array.isArray(data.messages)) {
            // Server returned offline catch-up list
            setMessages((prev) => [...data.messages, ...prev]);
          } else if (data.text) {
            // Incoming real-time message packet
            const incomingMsg = {
              id: data.id || Date.now().toString(),
              text: data.text,
              senderId: data.senderId
            };
            setMessages((prev) => [incomingMsg, ...prev]);
          }
        } catch (err) {
          console.error("Error parsing incoming message packet:", err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket connection error encountered:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed.');
        setConnected(false);
        clearInterval(heartbeatTimerRef.current);
      };
    }

    initializeChatSession();

    // Cleanup: Terminate connection and clear timers when user exits the screen
    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
    };
  }, [contactId]);

  // 2. Dispatch Text Output Message
  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    const messagePayload = {
      id: Date.now().toString(),
      text: inputText.trim(),
      senderId: myUserId,
      receiverId: contactId
    };

    // Render immediately locally for optimal user experience
    setMessages((prev) => [messagePayload, ...prev]);
    setInputText('');

    // Pipe directly out through active socket connection
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(messagePayload));
    } else {
      console.warn("Socket disconnected. Message cached locally only.");
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{contactName || 'Chat Room'}</Text>
        <Text style={[styles.statusText, connected ? styles.online : styles.offline]}>
          {connected ? '● connected' : '○ connecting...'}
        </Text>
      </View>

      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isMe = item.senderId === myUserId;
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.msgText, isMe ? styles.textMe : styles.textThem]}>
                {item.text}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type message..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingTop: Platform.OS === 'ios' ? 15 : 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e0e0e0', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#212529' },
  statusText: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  online: { color: '#4CD964' },
  offline: { color: '#FF3B30' },
  listContent: { paddingHorizontal: 14, paddingVertical: 12 },
  bubble: { maxWidth: '75%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8 },
  bubbleMe: { backgroundColor: '#007AFF', alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  bubbleThem: { backgroundColor: '#e9ecef', alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  msgText: { fontSize: 15, lineHeight: 20 },
  textMe: { color: '#fff' },
  textThem: { color: '#212529' },
  inputBar: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff', gap: 12, alignItems: 'center', borderTopWidth: 1, borderColor: '#eee' },
  input: { flex: 1, height: 40, backgroundColor: '#f1f3f5', borderRadius: 20, paddingHorizontal: 16, fontSize: 15, color: '#212529' },
  sendBtn: { paddingHorizontal: 8 },
  sendText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 }
});
