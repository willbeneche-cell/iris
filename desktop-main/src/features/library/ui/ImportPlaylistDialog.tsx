import { useState } from "react";
import { LinkLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import Dialog from "@/shared/ui/Dialog";
import { DialogActions, DialogButton, TextInput } from "@/shared/ui";
import { useImportStore } from "../store/importStore";

export interface ImportPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Replaces the "import" tab of the removed legacy create-playlist modal.
 * Parsing stays client-side; the completion card in /library shows progress and
 * `finalizeImportedPlaylist` writes the result to Supabase.
 */
export function ImportPlaylistDialog({
  open,
  onOpenChange,
}: ImportPlaylistDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (busy) return;
    setError("");
    onOpenChange(false);
  };

  const submit = async () => {
    if (busy) return;
    let target = url.trim();
    if (!target) {
      setError(t("common.paste_link_first"));
      return;
    }
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    setBusy(true);
    setError("");
    try {
      await useImportStore.getState().startImport(target);
      setUrl("");
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : t("common.unsupported_link"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())} maxWidth={440}>
      <form
        className="flex flex-col gap-[14px] px-[20px] pb-[20px]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-[6px] pt-[4px]">
          <h2 className="m-0 text-heading font-[600] tracking-[-0.01em] text-text-primary">
            {t("common.import_playlist")}
          </h2>
          <p className="m-0 text-body text-text-secondary">
            {t("common.import_playlist_description")}
          </p>
        </div>

        <TextInput
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError("");
          }}
          icon={<LinkLine size={16} />}
          placeholder={t("common.paste_link_placeholder")}
          hasError={Boolean(error)}
          disabled={busy}
          autoFocus
        />

        {error ? (
          <span className="text-caption text-accent-primary">{error}</span>
        ) : null}

        <DialogActions>
          <DialogButton type="button" onClick={close}>
            {t("common.cancel")}
          </DialogButton>
          <DialogButton type="submit" variant="primary" loading={busy}>
            {busy ? t("common.importing") : t("common.import")}
          </DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}
