import 'react-native-get-random-values'
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store';
import { transactionService } from '@/services/supabase/transactionService';
import { COLORS } from '@/constants';

export default function RootLayout() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      transactionService.syncPending().catch(console.warn);
    }
  }, [isAuthenticated]);

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