import { useEffect } from "react";
import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  requireSupabaseClient,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/shared/supabase/client";
import type {
  ProfileRow,
  ProfileUpdate,
} from "@/shared/supabase/database.types";

export type SupabaseAuthStatus = "loading" | "authenticated" | "anonymous";

export interface SignUpResult {
  /** true when the project requires email confirmation before a session exists */
  requiresEmailConfirmation: boolean;
}

export interface UpdateProfileInput extends ProfileUpdate {
  username?: string;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

interface AuthStore {
  status: SupabaseAuthStatus;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  error: string | null;
  busy: boolean;
  start: () => void;
  applySession: (session: Session | null) => void;
  loadProfile: (userId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName?: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: UpdateProfileInput) => Promise<ProfileRow>;
  refreshProfile: () => Promise<void>;
}

let subscriptionStarted = false;

export const useSupabaseAuthStore = create<AuthStore>((set, get) => ({
  status: "loading",
  session: null,
  user: null,
  profile: null,
  error: null,
  busy: false,

  applySession: (session) => {
    const user = session?.user ?? null;
    set({
      session,
      user,
      status: session ? "authenticated" : "anonymous",
      profile: session ? get().profile : null,
    });
    if (user) void get().loadProfile(user.id);
  },

  start: () => {
    if (subscriptionStarted) return;
    subscriptionStarted = true;

    const supabase = getSupabaseClient();
    if (!supabase) {
      set({ status: "anonymous", error: SUPABASE_NOT_CONFIGURED_MESSAGE });
      return;
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) set({ error: error.message });
        get().applySession(data.session);
      })
      .catch((error: unknown) => {
        set({
          status: "anonymous",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    supabase.auth.onAuthStateChange((_event, session) => {
      get().applySession(session);
    });
  },

  loadProfile: async (userId) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ profile: (data as ProfileRow | null) ?? null });
  },

  signIn: async (email, password) => {
    const supabase = requireSupabaseClient();
    set({ busy: true, error: null });
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error(error.message);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signUp: async (email, password, username, displayName) => {
    const supabase = requireSupabaseClient();
    const trimmedUsername = username.trim();
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      throw new Error(
        "Username must be 3 to 30 characters (letters, digits, dot, dash or underscore).",
      );
    }
    const trimmedDisplayName = displayName?.trim();
    set({ busy: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: trimmedUsername,
            ...(trimmedDisplayName ? { full_name: trimmedDisplayName } : {}),
          },
        },
      });
      if (error) throw new Error(error.message);

      // The trigger deduplicates a racing signup by suffixing the handle; the
      // user must not silently get a different pseudo than the one requested.
      if (data.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (
          profile &&
          typeof profile.username === "string" &&
          profile.username.toLowerCase() !== trimmedUsername.toLowerCase()
        ) {
          await supabase.auth.signOut();
          throw new Error("This username is already taken.");
        }
      }

      return { requiresEmailConfirmation: data.session === null };
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signOut: async () => {
    const supabase = requireSupabaseClient();
    set({ busy: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      set({ status: "anonymous", session: null, user: null, profile: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  updateProfile: async (patch) => {
    const supabase = requireSupabaseClient();
    const userId = get().user?.id;
    if (!userId) throw new Error("Not signed in.");

    if (patch.username !== undefined) {
      const trimmed = patch.username.trim();
      if (!USERNAME_PATTERN.test(trimmed)) {
        throw new Error(
          "Username must be 3 to 30 characters (letters, digits, dot, dash or underscore).",
        );
      }
      patch = { ...patch, username: trimmed };
    }

    set({ busy: true, error: null });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("id, username, avatar_url, updated_at")
        .single();
      if (error) {
        // 23505 = unique violation on lower(username)
        throw new Error(
          error.code === "23505"
            ? "This username is already taken."
            : error.message,
        );
      }
      const profile = data as ProfileRow;
      set({ profile });
      return profile;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (userId) await get().loadProfile(userId);
  },
}));

/**
 * Supabase email/password session plus the matching `profiles` row.
 * Subscribes to auth changes once per app instance and keeps `profile` in sync.
 */
export function useAuth() {
  const status = useSupabaseAuthStore((state) => state.status);
  const session = useSupabaseAuthStore((state) => state.session);
  const user = useSupabaseAuthStore((state) => state.user);
  const profile = useSupabaseAuthStore((state) => state.profile);
  const error = useSupabaseAuthStore((state) => state.error);
  const busy = useSupabaseAuthStore((state) => state.busy);
  const start = useSupabaseAuthStore((state) => state.start);
  const signIn = useSupabaseAuthStore((state) => state.signIn);
  const signUp = useSupabaseAuthStore((state) => state.signUp);
  const signOut = useSupabaseAuthStore((state) => state.signOut);
  const updateProfile = useSupabaseAuthStore((state) => state.updateProfile);
  const refreshProfile = useSupabaseAuthStore((state) => state.refreshProfile);

  useEffect(() => {
    start();
  }, [start]);

  return {
    status,
    session,
    user,
    profile,
    error,
    busy,
    isConfigured: isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile,
  };
}

export type UseAuthResult = ReturnType<typeof useAuth>;
