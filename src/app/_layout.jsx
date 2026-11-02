import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../auth/AuthContext';

// Keep the splash screen up until we know whether the user is signed in
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { isReady, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;

    // Hide splash screen once we know the state
    SplashScreen.hideAsync().catch(() => {});

    // Determine what route group the user is attempting to view
    const inAuthGroup = segments[0] === '(auth)';
    const inUnauthGroup = segments[0] === '(unauth)';

    if (!isAuthenticated) {
      // If NOT logged in, and NOT already in the unauth screens -> boot them to registration
      if (!inUnauthGroup) {
        router.replace('/(unauth)/regAuth');
      }
    } else {
      // If logged in, and trying to access landing/auth screens -> route them to the dashboard
      if (!inAuthGroup) {
        router.replace('/(auth)/contacts');
      }
    }
  }, [isReady, isAuthenticated, segments]);

  if (!isReady) return null;

  // Render a clean Expo Router native Stack tree
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

