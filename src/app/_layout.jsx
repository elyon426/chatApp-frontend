import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../auth/AuthContext';

// Keep the splash screen up until we know whether the user is signed in
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { isReady, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* App entry: redirects to the right group based on auth state */}
      <Stack.Screen name="index" />

      <Stack.Protected guard={isAuthenticated} redirectTo="/(unauth)/regAuth">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated} redirectTo="/(auth)/contacts">
        <Stack.Screen name="(unauth)" />
      </Stack.Protected>
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
