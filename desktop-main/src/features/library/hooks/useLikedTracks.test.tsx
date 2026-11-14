// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { act } from "react";
import { useLikedTracks, applyOptimisticLike } from "./useLikedTracks";
import * as likedApi from "../saved/api/likedTracksApi";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({ status: "authenticated" }),
  useSupabaseAuthStore: {
    getState: () => ({ user: { id: "u1" } }),
    subscribe: () => () => {},
  },
}));

vi.mock("../saved/api/likedTracksApi", () => ({
  listLikedTracks: vi.fn(),
  likeTrack: vi.fn(),
  unlikeTrack: vi.fn(),
}));

describe("useLikedTracks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("does not flip isLoading to true when library:changed event is dispatched after initial load", async () => {
    (likedApi.listLikedTracks as any).mockResolvedValue([
      {
        id: "track-1",
        title: "Song 1",
        artists: "Artist 1",
        coverUrl: "",
        durationMs: 0,
        playCount: 0,
      },
    ]);

    let hookResult: ReturnType<typeof useLikedTracks> | undefined;

    function TestComponent() {
      hookResult = useLikedTracks();
      return <div>loaded: {(!hookResult.isLoading).toString()}</div>;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hookResult?.isLoading).toBe(false);
    expect(hookResult?.data.tracks).toHaveLength(1);

    // Apply optimistic like
    act(() => {
      applyOptimisticLike("track-2");
    });
    expect(hookResult?.data.tracks).toHaveLength(2);
    expect(hookResult?.isLoading).toBe(false);

    // Dispatch library:changed event to simulate background update after liking
    let backgroundPromiseResolve: (value: any) => void;
    const backgroundPromise = new Promise((resolve) => {
      backgroundPromiseResolve = resolve;
    });

    (likedApi.listLikedTracks as any).mockImplementation(
      () => backgroundPromise,
    );

    await act(async () => {
      window.dispatchEvent(new Event("library:changed"));
    });

    // isLoading MUST REMAIN FALSE during background refetch
    expect(hookResult?.isLoading).toBe(false);

    // Resolve background refetch
    await act(async () => {
      backgroundPromiseResolve!([
        {
          id: "track-1",
          title: "Song 1",
          artists: "Artist 1",
          coverUrl: "",
          durationMs: 0,
          playCount: 0,
        },
        {
          id: "track-2",
          title: "Song 2",
          artists: "Artist 2",
          coverUrl: "",
          durationMs: 0,
          playCount: 0,
        },
      ]);
      await Promise.resolve();
    });

    expect(hookResult?.isLoading).toBe(false);
    expect(hookResult?.data.tracks).toHaveLength(2);
  });
});
