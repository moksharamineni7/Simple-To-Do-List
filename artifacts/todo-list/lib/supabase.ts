import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseConfigError() {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
    return 'Add the Supabase project URL to the app environment.';
  }
  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    return 'Add the Supabase publishable/anon key to the app environment.';
  }
  return '';
}

export function getSupabaseClient() {
  const configError = getSupabaseConfigError();
  if (configError) throw new Error(configError);

  if (!client) {
    client = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      },
    );
  }

  return client;
}
