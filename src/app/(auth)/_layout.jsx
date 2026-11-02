import React, { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function AuthLayout() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 1. Session Gate: Check for access token before opening authenticated screens
  useEffect(() => {
    async function verifySessionGate() {
      try {
        const token = await SecureStore.getItemAsync('secure_plain_token');
        
        // IF no token redirect to (unauth)/regAuth instead of /registration
        if (!token) {
          router.replace('/(unauth)/regAuth'); 
        }
      } catch (error) {
        console.error("Auth security gate failure:", error);
      } finally {
        setCheckingAuth(false);
      }
    }

    verifySessionGate();
  }, []);

  // Show a full-screen loading spinner while checking security credentials
  if (checkingAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // 2. Navigation Presentation Definitions
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#007AFF',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#212529',
        },
        headerShadowVisible: false, // Cleaner visual appearance across platforms
      }}
    >
      {/* Main Chats/Contacts Listing Screen Config (The group root index) */}
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Chats',
          headerShown: false, // Hides native navbar since we built custom headers inside the file
        }} 
      />

      {/* Individual Message Room Config */}
      <Stack.Screen 
        name="chat" 
        options={{ 
          title: '', // Left blank to dynamically emphasize custom titles built in chat.jsx
          headerBackTitle: 'Back', // iOS back arrow button text title string
        }} 
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
});
