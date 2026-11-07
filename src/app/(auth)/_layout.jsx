import { Stack } from 'expo-router';

// Auth gating now lives in the root layout (Stack.Protected), so this layout
// only defines how the signed-in screens are presented.
export default function AuthLayout() {
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
      {/* Chats list screen (custom header is built inside the file) */}
      <Stack.Screen
        name="contacts"
        options={{
          title: 'Chats',
          headerShown: false,
        }}
      />

      {/* Individual message room */}
      <Stack.Screen
        name="chat"
        options={{
          headerShown: false, // chat.jsx draws its own header with safe-area padding
        }}
      />
    </Stack>
  );
}
