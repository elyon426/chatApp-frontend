import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const SERVER = 'https://chatapp-backend-m6bp.onrender.com';

// Same keys that (unauth)/regAuth.jsx uses
const USER_ID_KEY = 'secure_user_id';
const PLAIN_TOKEN_KEY = 'secure_plain_token';
const DEVICE_ID_KEY = 'secure_device_uuid';

const AuthContext = createContext({
  isReady: false,
  isAuthenticated: false,
  refreshSession: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState(null);

  // signOut must be defined first because refreshSession uses it
  const signOut = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(PLAIN_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_ID_KEY);
      // DEVICE_ID_KEY stays: it identifies this phone, not this login
    } catch (error) {
      console.error('Auth sign-out failure:', error);
    }
    setToken(null);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const [storedToken, userId, deviceId] = await Promise.all([
        SecureStore.getItemAsync(PLAIN_TOKEN_KEY),
        SecureStore.getItemAsync(USER_ID_KEY),
        SecureStore.getItemAsync(DEVICE_ID_KEY),
      ]);

      if (!storedToken || !userId || !deviceId) {
        setToken(null);
        return;
      }

      // Let them in right away so the app works offline
      setToken(storedToken);

      // Verify in the background. Only an explicit 401 signs them out.
      fetch(`${SERVER}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: storedToken, userId, deviceId }),
      })
        .then((res) => {
          if (res.status === 401) signOut();
        })
        .catch(() => {}); // offline or Render cold start: keep the local session
    } catch (error) {
      console.error('Auth session read failure:', error);
      setToken(null);
    } finally {
      setIsReady(true);
    }
  }, [signOut]);

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

