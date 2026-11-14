import { useState } from "react";
import { ExitLine } from "@mingcute/react";
import { UserAvatar } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { useAuth, SignOutDialog } from "@/features/auth";
import {
  shouldAskBeforeSignOut,
  useSavedTracksStore,
} from "@/features/library/saved";

interface SettingsUserFooterProps {
  onClose: () => void;
}

export function SettingsUserFooter({ onClose }: SettingsUserFooterProps) {
  const { t } = useTranslation();
  const { user, profile, signOut: signOutSupabase } = useAuth();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    profile?.username ||
    "Iris";
  const handle = profile?.username
    ? `@${profile.username}`
    : (user?.email ?? t("settings.manage_account"));
  const signOutLabel = t("settings.profile.sign_out") || "Log out";
  const [asking, setAsking] = useState(false);
  const records = useSavedTracksStore((state) => state.records);
  const answerSignOut = useSavedTracksStore((state) => state.answerSignOut);
  const downloadedBytes = records.reduce(
    (sum, record) => sum + record.byteSize,
    0,
  );

  const signOut = async () => {
    onClose();
    await signOutSupabase();
  };

  const requestSignOut = () => {
    if (shouldAskBeforeSignOut(useSavedTracksStore.getState())) {
      setAsking(true);
      return;
    }
    void signOut();
  };

  return (
    <div className="shrink-0 px-[10px] pt-[6px] pb-[10px]">
      <div className="flex min-w-0 items-center gap-[10px] rounded-item bg-fill p-[8px] pr-[6px]">
        <span className="relative shrink-0">
          <UserAvatar
            user={{
              avatarUrl: profile?.avatar_url ?? null,
              displayName,
              username: profile?.username ?? null,
              email: user?.email ?? null,
            }}
            size={32}
          />
          <span
            aria-hidden
            className="absolute right-[-1px] bottom-[-1px] h-[9px] w-[9px] rounded-full bg-emerald-500"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px] font-sans">
          <span className="truncate text-body leading-[16px] font-[500] text-text-primary">
            {displayName}
          </span>
          <span className="truncate text-caption leading-[15px] text-text-tertiary">
            {handle}
          </span>
        </span>
        <button
          type="button"
          onClick={requestSignOut}
          title={signOutLabel}
          aria-label={signOutLabel}
          className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent p-0 text-text-tertiary transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <ExitLine size={16} />
        </button>
      </div>
      <SignOutDialog
        open={asking}
        songCount={records.length}
        bytes={downloadedBytes}
        onCancel={() => setAsking(false)}
        onSignOut={(keep, remember) => {
          answerSignOut(keep, remember);
          setAsking(false);
          void signOut();
        }}
      />
    </div>
  );
}
