import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Single Supabase client for the renderer (web/PWA and Electron).
 *
 * The anon key is public by design: every row is protected by the RLS policies
 * in supabase/migrations. A service_role key must never reach this bundle.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storageKey: "iris-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // The app uses a hash router; PKCE keeps the callback in ?code=… so the
        // hash stays free for routes.
        flowType: "pkce",
      },
    });
  }
  return client;
}

export function requireSupabaseClient(): SupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  return supabase;
}
