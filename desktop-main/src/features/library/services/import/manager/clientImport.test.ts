import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  parseImportSource: vi.fn(),
  searchRaw: vi.fn(),
}));

vi.mock("../parseImportSource", () => ({
  parseImportSource: mocks.parseImportSource,
}));
vi.mock("@/shared/youtube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/youtube")>();
  return { ...actual, searchRaw: mocks.searchRaw };
});

import { runClientImport } from "./clientImportManager";
import { finalizeImportedPlaylist } from "./finalizeImport";
import * as playlistsApi from "@/features/playlists/api";
import { useSupabaseAuthStore } from "@/features/auth/hooks/useAuth";

function searchTrack(
  id: string,
  title: string,
  artist: string,
  durationMs: number,
): SearchResult {
  return {
    type: "track",
    id,
    title,
    artists: [{ id: `UC_${artist}`, name: artist }],
    durationMs,
  };
}

const spotifyPlaylist = {
  source: "spotify" as const,
  sourceUrl: "https://open.spotify.com/playlist/abc",
  title: "Road trip",
  tracks: [
    {
      sourceId: "sp1",
      title: "Blinding Lights",
      artists: ["The Weeknd"],
      durationMs: 200_040,
    },
    {
      sourceId: "sp2",
      title: "Some Obscure Demo",
      artists: ["Nobody Known"],
      durationMs: 61_000,
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  mocks.parseImportSource.mockReset();
  mocks.searchRaw.mockReset();
});

describe("runClientImport", () => {
  it("auto-approves confident matches and leaves the rest out of the playlist", async () => {
    mocks.parseImportSource.mockResolvedValue(spotifyPlaylist);
    mocks.searchRaw.mockImplementation(async (query: string) =>
      query.toLowerCase().includes("blinding")
        ? [searchTrack("4NRXx6U8ABQ", "Blinding Lights", "The Weeknd", 200_000)]
        : [],
    );
    const progress: number[] = [];

    const outcome = await runClientImport(spotifyPlaylist.sourceUrl, {
      onProgress: (update) =>
        progress.push(update.result.imported + update.result.skipped),
    });

    expect(outcome.approvedTracks.map((track) => track.id)).toEqual([
      "4NRXx6U8ABQ",
    ]);
    expect(outcome.result).toEqual({ total: 2, imported: 1, skipped: 1 });
    expect(outcome.reviewItems).toEqual([]);
    expect(progress[progress.length - 1]).toBe(2);
  });

  it("sends ambiguous matches with a candidate to review", async () => {
    mocks.parseImportSource.mockResolvedValue({
      ...spotifyPlaylist,
      tracks: [spotifyPlaylist.tracks[0]],
    });
    mocks.searchRaw.mockResolvedValue([
      searchTrack(
        "liveversion",
        "Blinding Lights (Live at SNL)",
        "The Weeknd",
        260_000,
      ),
    ]);

    const outcome = await runClientImport(spotifyPlaylist.sourceUrl);

    expect(outcome.approvedTracks).toEqual([]);
    expect(outcome.reviewItems).toHaveLength(1);
    expect(outcome.reviewItems[0]).toMatchObject({
      status: "pending",
      proposedTrack: { id: "liveversion" },
      position: 0,
    });
  });

  it("uses youtube ids directly without searching", async () => {
    mocks.parseImportSource.mockResolvedValue({
      source: "youtube",
      sourceUrl: "https://music.youtube.com/playlist?list=PL1",
      title: "Mine",
      canonicalTrackIds: ["dQw4w9WgXcQ"],
      tracks: [
        {
          sourceId: "dQw4w9WgXcQ",
          title: "Never Gonna Give You Up",
          artists: ["Rick Astley"],
          durationMs: 213_000,
        },
      ],
    });

    const outcome = await runClientImport(
      "https://music.youtube.com/playlist?list=PL1",
    );

    expect(mocks.searchRaw).not.toHaveBeenCalled();
    expect(outcome.approvedTracks[0]).toMatchObject({
      id: "dQw4w9WgXcQ",
      cover: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
    });
  });
});

describe("finalizeImportedPlaylist", () => {
  const track = {
    id: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    artists: [{ id: "UC1", name: "Rick Astley" }],
    durationMs: 213_000,
  };
  const playlist = { id: "pl_1", name: "Mine" } as Awaited<
    ReturnType<typeof playlistsApi.createPlaylist>
  >;

  afterEach(() => {
    useSupabaseAuthStore.setState({ user: null });
  });

  it("creates the playlist in Supabase and bulk-inserts deduplicated tracks", async () => {
    useSupabaseAuthStore.setState({ user: { id: "user_1" } } as never);
    const create = vi
      .spyOn(playlistsApi, "createPlaylist")
      .mockResolvedValue(playlist);
    const bulk = vi
      .spyOn(playlistsApi, "addTracksToPlaylist")
      .mockResolvedValue(1);

    await expect(
      finalizeImportedPlaylist("Mine", undefined, [track, track]),
    ).resolves.toEqual({ playlistId: "pl_1", saved: 1 });

    expect(create).toHaveBeenCalledWith("user_1", {
      name: "Mine",
      description: null,
    });
    expect(bulk).toHaveBeenCalledTimes(1);
    const [playlistId, savedTracks] = bulk.mock.calls[0];
    expect(playlistId).toBe("pl_1");
    expect(savedTracks).toHaveLength(1);
    expect(savedTracks[0]).toMatchObject({
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
    });
  });

  it("refuses to import without a signed-in user", async () => {
    useSupabaseAuthStore.setState({ user: null });
    await expect(
      finalizeImportedPlaylist("Mine", undefined, [track]),
    ).rejects.toThrow(/sign in to import/i);
  });
});
