import 'react-native-get-random-values'
import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store';
import { transactionService } from '@/services/supabase/transactionService';
import { onSessionExpired } from '@/services/api/client';
import { COLORS } from '@/constants';

export default function RootLayout() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      transactionService.syncPending().catch(console.warn);
    }
  }, [isAuthenticated]);

  // Single, app-wide reaction to a genuinely expired session (see
  // src/services/api/client.ts). Any screen's API call can trigger this —
  // it must not depend on that screen still being mounted or on its own
  // catch block to redirect, or the shopkeeper is left stuck retrying a
  // request that can never succeed.
  useEffect(() => {
    return onSessionExpired(() => {
      useAuthStore.getState().logout();
      Toast.show({
        type: 'error',
        text1: 'সেশন শেষ হয়ে গেছে',
        text2: 'আবার লগইন করুন',
      });
      router.replace('/pin-login');
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={COLORS.primary} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="shop-setup" />
          <Stack.Screen name="pin-login" />
          <Stack.Screen name="product-setup" />
          {/* <Stack.Screen name="manual-entry" /> */}
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="barcode-scanner" options={{ headerShown: false }} />
        </Stack>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}