import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store';

export default function Index() {
  const { shop, isAuthenticated } = useAuthStore();
  if (!shop) return <Redirect href="/onboarding" />;
  if (!isAuthenticated) return <Redirect href="/pin-login" />;
  return <Redirect href="/(tabs)/home" />;
}
