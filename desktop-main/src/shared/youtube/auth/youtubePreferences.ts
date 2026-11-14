import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface YoutubePreferencesState {
  accountPlayback: boolean;
  promptSignIn: boolean;
  syncLibrary: boolean;
  signOutWithIris: boolean;
  setAccountPlayback: (accountPlayback: boolean) => void;
  setPromptSignIn: (promptSignIn: boolean) => void;
  setSyncLibrary: (syncLibrary: boolean) => void;
  setSignOutWithIris: (signOutWithIris: boolean) => void;
}

export const useYoutubePreferences = create<YoutubePreferencesState>()(
  persist(
    (set) => ({
      accountPlayback: true,
      promptSignIn: true,
      syncLibrary: true,
      signOutWithIris: false,
      setAccountPlayback: (accountPlayback) => set({ accountPlayback }),
      setPromptSignIn: (promptSignIn) => set({ promptSignIn }),
      setSyncLibrary: (syncLibrary) => set({ syncLibrary }),
      setSignOutWithIris: (signOutWithIris) => set({ signOutWithIris }),
    }),
    {
      name: "iris_youtube_preferences",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function prefersAccountPlayback(): boolean {
  return useYoutubePreferences.getState().accountPlayback;
}

export function prefersSignInPrompt(): boolean {
  return useYoutubePreferences.getState().promptSignIn;
}

export function prefersSignOutWithIris(): boolean {
  return useYoutubePreferences.getState().signOutWithIris;
}
