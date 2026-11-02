import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

export default function Index() {
  const { isAuthenticated, isReady } = useAuth();

  // Wait until AuthContext finishes checking SecureStore before computing the redirect
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  // Safely branch to the correct layout group without an instantaneous flash
  return (
    <Redirect href={isAuthenticated ? '/(auth)/contacts' : '/(unauth)/regAuth'} />
  );
}
