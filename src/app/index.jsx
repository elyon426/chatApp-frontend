import { Redirect } from 'expo-router';
import { useAuth } from '../auth/AuthContext';

// App entry route ("/"). Sends the user to the chat list when signed in,
// otherwise to registration.
export default function Index() {
  const { isAuthenticated } = useAuth();

  return (
    <Redirect href={isAuthenticated ? '/(auth)/contacts' : '/(unauth)/regAuth'} />
  );
}
