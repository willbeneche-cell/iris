import type { IrisElectronApi } from "../electron/preload";

declare global {
  interface Window {
    irisElectron?: IrisElectronApi;
  }
}

export {};
