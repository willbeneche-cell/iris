import { log } from "./logger";

export function initBundleStampLog(): () => void {
  if (typeof window === "undefined") return () => {};
  return (
    window.irisElectron?.onBundleStamp?.((line) =>
      log("gray", "bundle", line),
    ) ?? (() => {})
  );
}
