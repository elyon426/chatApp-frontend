import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../auth/AuthContext';

// Prevent the native splash screen from hiding automatically on boot
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { isReady, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Stop completely if SecureStore is still reading the device storage
    if (!isReady) return;

    // Hide the splash screen now that we accurately know the authentication state
    SplashScreen.hideAsync().catch(() => {});

    // Detect which directory group the user is currently looking at
    const inAuthGroup = segments[0] === '(auth)';
    const inUnauthGroup = segments[0] === '(unauth)';

    if (!isAuthenticated) {
      // Rule 1: If NOT logged in, and trying to browse private screens -> force to registration
      if (inAuthGroup) {
        router.replace('/(unauth)/regAuth');
      }
    } else {
      // Rule 2: If logged in, and trying to browse registration/landing screens -> force to chats
      if (inUnauthGroup) {
        router.replace('/(auth)/contacts');
      }
    }
  }, [isReady, isAuthenticated, segments]);

  // Keep the UI blank while the splash screen is up to prevent rendering glitches
  if (!isReady) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(unauth)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
