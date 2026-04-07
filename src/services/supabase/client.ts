
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const db = {
  shops: () => supabase.from('shops'),
  users: () => supabase.from('users'),
  products: () => supabase.from('products'),
  transactions: () => supabase.from('transactions'),
  daily_summaries: () => supabase.from('daily_summaries'),
  global_products: () => supabase.from('global_products'),
};