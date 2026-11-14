import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/shared/supabase/client";

export type UsernameStatus = "idle" | "checking" | "available" | "taken";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const CHECK_DELAY_MS = 400;

/**
 * Debounced availability check backed by the `is_username_available` RPC.
 * Anonymous sign-up cannot read `profiles` (RLS), so the check goes through a
 * SECURITY DEFINER function that only returns a boolean.
 */
export function useUsernameAvailability(
  username: string,
  enabled: boolean,
): UsernameStatus {
  const [result, setResult] = useState<{
    username: string;
    status: UsernameStatus;
  } | null>(null);
  const candidate = username.trim().toLowerCase();
  const active = enabled && USERNAME_RE.test(candidate);

  useEffect(() => {
    if (!active) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setResult({ username: candidate, status: "checking" });
      void Promise.resolve(
        supabase.rpc("is_username_available", { p_username: candidate }),
      )
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setResult({ username: candidate, status: "idle" });
            return;
          }
          setResult({
            username: candidate,
            status: data === true ? "available" : "taken",
          });
        })
        .catch(() => {
          if (!cancelled) setResult({ username: candidate, status: "idle" });
        });
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, candidate]);

  if (!active) return "idle";
  if (!result || result.username !== candidate) return "checking";
  return result.status;
}
