import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  importSpotifyPlaylist,
  refreshSpotifyPlaylist,
  getSpotifyPlaylistTracks,
  isSpotifyPlaylist,
} from "./spotify-import";
import type { Track, Playlist } from "../../../../packages/contracts/src/index";
import type { SpotifyPlaylistTrack } from "../../../../packages/contracts/src/spotify";

vi.mock("./spotify", () => ({
  spotifyService: {
    isConfigured: vi.fn(() => true),
    importPlaylist: vi.fn(),
  },
  SpotifyAuthError: class SpotifyAuthError extends Error {
    isConfigError: boolean;
    constructor(message: string, isConfigError: boolean = false) {
      super(message);
      this.name = "SpotifyAuthError";
      this.isConfigError = isConfigError;
    }
  },
}));

vi.mock("./storage", () => ({
  libraryStorage: {
    savePlaylist: vi.fn(),
    listTracks: vi.fn(),
  },
}));

import { libraryStorage } from "./storage";
import { spotifyService } from "./spotify";

const makeTrack = (overrides: Partial<Track> = {}): Track => ({
  id: "track-1",
  title: "Neon Afterglow",
  artist: "Kairo Bloom",
  album: "Afterimage",
  durationMs: 218000,
  trackNumber: null,
  mimeType: "audio/mpeg",
  fileSize: 1000,
  artworkRef: null,
  sourceType: "browser-file",
  importedAt: new Date().toISOString(),
  fingerprint: null,
  available: true,
  metadataStatus: "complete",
  ...overrides,
});

const makeSpotifyTrack = (
  overrides: Partial<SpotifyPlaylistTrack> = {},
): SpotifyPlaylistTrack => ({
  entryId: "entry-1",
  spotifyPlaylistId: "playlist-1",
  spotifyTrackId: "4iV5W9uYEdYUVa79Axb7Rh",
  spotifyTrackUri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
  title: "Neon Afterglow",
  artists: ["Kairo Bloom"],
  album: "Afterimage",
  durationMs: 218000,
  artworkUrl: null,
  position: 0,
  matchedTrackId: null,
  matchStatus: "unmatched",
  matchReason: null,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  (spotifyService.isConfigured as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (libraryStorage.savePlaylist as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("importSpotifyPlaylist", () => {
  it("rejects invalid URLs", async () => {
    await expect(importSpotifyPlaylist("not-a-url", [makeTrack()])).rejects.toThrow(
      "Invalid Spotify playlist URL",
    );
  });

  it("throws when Spotify is not configured", async () => {
    (spotifyService.isConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await expect(
      importSpotifyPlaylist("https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp", []),
    ).rejects.toThrow(/Spotify is not configured/);
  });

  it("imports and matches playlist tracks", async () => {
    const spotifyTrack = makeSpotifyTrack();
    (spotifyService.importPlaylist as ReturnType<typeof vi.fn>).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        name: "My Playlist",
        description: null,
        artworkUrl: null,
        totalTracks: 1,
      },
      tracks: [spotifyTrack],
    });

    const result = await importSpotifyPlaylist(
      "https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp",
      [makeTrack()],
    );

    expect(result.playlist.name).toBe("My Playlist");
    expect(result.spotifyTracks[0].matchStatus).toBe("matched");
    expect(libraryStorage.savePlaylist).toHaveBeenCalledTimes(1);
  });

  it("passes track ID to Spotify import", async () => {
    const spotifyTrack = makeSpotifyTrack();
    (spotifyService.importPlaylist as ReturnType<typeof vi.fn>).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        name: "Test",
        description: null,
        artworkUrl: null,
        totalTracks: 1,
      },
      tracks: [spotifyTrack],
    });

    await importSpotifyPlaylist(
      "https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp?si=abc123",
      [makeTrack()],
    );

    expect(spotifyService.importPlaylist).toHaveBeenCalledWith("7tXCYmr41YKXMgYyeo0jXp");
  });
});

describe("refreshSpotifyPlaylist", () => {
  it("refreshes an existing Spotify playlist", async () => {
    const spotifyTrack = makeSpotifyTrack({ matchStatus: "matched", matchedTrackId: "track-1" });
    (spotifyService.importPlaylist as ReturnType<typeof vi.fn>).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        name: "Updated Playlist",
        description: null,
        artworkUrl: null,
        totalTracks: 1,
      },
      tracks: [spotifyTrack],
    });

    const playlist: Playlist = {
      id: "playlist-uuid",
      name: "Old Name",
      description: null,
      trackIds: ["track-1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMetadata: {
        sourceType: "spotify-metadata",
        spotifyPlaylistId: "7tXCYmr41YKXMgYyeo0jXp",
      },
    };

    const result = await refreshSpotifyPlaylist(playlist, [makeTrack()]);

    expect(result.playlist.name).toBe("Updated Playlist");
    expect(libraryStorage.savePlaylist).toHaveBeenCalled();
  });

  it("throws for non-Spotify playlists", async () => {
    const playlist: Playlist = {
      id: "playlist-uuid",
      name: "Regular Playlist",
      description: null,
      trackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMetadata: null,
    };

    await expect(refreshSpotifyPlaylist(playlist, [])).rejects.toThrow(
      "not a Spotify import",
    );
  });
});

describe("getSpotifyPlaylistTracks", () => {
  it("returns spotify tracks from playlist metadata", () => {
    const spotifyTrack = makeSpotifyTrack();
    const playlist: Playlist = {
      id: "playlist-uuid",
      name: "Test",
      description: null,
      trackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMetadata: {
        sourceType: "spotify-metadata",
        spotifyPlaylistId: "playlist-1",
        spotifyTracks: [spotifyTrack],
      },
    };

    const tracks = getSpotifyPlaylistTracks(playlist);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("Neon Afterglow");
  });

  it("returns empty array for non-Spotify playlists", () => {
    const playlist: Playlist = {
      id: "playlist-uuid",
      name: "Test",
      description: null,
      trackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMetadata: null,
    };

    expect(getSpotifyPlaylistTracks(playlist)).toEqual([]);
  });
});

describe("isSpotifyPlaylist", () => {
  it("returns true for Spotify playlists", () => {
    const playlist: Playlist = {
      id: "playlist-uuid",
      name: "Test",
      description: null,
      trackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMetadata: { sourceType: "spotify-metadata" },
    };
    expect(isSpotifyPlaylist(playlist)).toBe(true);
  });

  it("returns false for non-Spotify playlists", () => {
    const playlist: Playlist = {
      id: "playlist-uuid",
      name: "Test",
      description: null,
      trackIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMetadata: null,
    };
    expect(isSpotifyPlaylist(playlist)).toBe(false);
  });
});
