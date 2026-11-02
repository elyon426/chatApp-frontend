import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Same keys that (unauth)/regAuth.jsx writes after a successful registration
const USER_ID_KEY = 'secure_user_id';
const PLAIN_TOKEN_KEY = 'secure_plain_token';

const AuthContext = createContext({
  isReady: false,
  isAuthenticated: false,
  refreshSession: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState(null);

  // Reads the stored credentials and updates auth state.
  // Call again after registration so route guards pick up the new session.
  const refreshSession = useCallback(async () => {
    try {
      const stored = await SecureStore.getItemAsync(PLAIN_TOKEN_KEY);
      setToken(stored || null);
    } catch (error) {
      console.error('Auth session read failure:', error);
      setToken(null);
    } finally {
      setIsReady(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(PLAIN_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_ID_KEY);
    } catch (error) {
      console.error('Auth sign-out failure:', error);
    }
    setToken(null);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  return (
    <AuthContext.Provider
      value={{ isReady, isAuthenticated: !!token, refreshSession, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
