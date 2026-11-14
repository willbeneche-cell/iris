import { useState } from "react";
import { useTranslation } from "@/languages";
import Dialog from "@/shared/ui/Dialog";
import { DialogActions, DialogButton, TextInput } from "@/shared/ui";
import type { CreatePlaylistInput } from "../types";

export interface CreatePlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreatePlaylistInput) => Promise<void>;
}

export function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreate,
}: CreatePlaylistDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
    setIsPublic(false);
    setError("");
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError(t("common.name_required"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || null,
        isPublic,
      });
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      maxWidth={400}
    >
      <div className="flex flex-col gap-3 px-5 pb-5 pt-4">
        <h2 className="m-0 text-[16px] font-semibold text-text-primary">
          {t("common.create_empty_playlist")}
        </h2>

        <TextInput
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("common.playlist_name")}
          disabled={busy}
          hasError={Boolean(error)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />

        <TextInput
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("common.add_description")}
          disabled={busy}
        />

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-item bg-fill px-3 py-2 text-[12.5px] text-text-primary">
          <span>{t("common.make_public")}</span>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            className="h-4 w-4 accent-[var(--accent-primary)]"
          />
        </label>

        {error ? (
          <p role="alert" className="m-0 text-caption text-accent-primary">
            {error}
          </p>
        ) : null}

        <DialogActions className="mt-1">
          <DialogButton variant="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </DialogButton>
          <DialogButton
            variant="primary"
            onClick={() => void submit()}
            disabled={busy}
          >
            {t("common.create")}
          </DialogButton>
        </DialogActions>
      </div>
    </Dialog>
  );
}
