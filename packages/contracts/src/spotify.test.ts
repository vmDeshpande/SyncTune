import { describe, expect, it } from "vitest";
import {
  parseSpotifyPlaylistUrl,
  isSpotifyUrl,
  createSpotifyPlaylistTrack,
  normalizeString,
  normalizeArtists,
  MatchStatusSchema,
  SpotifyPlaylistTrackSchema,
} from "./spotify";

describe("parseSpotifyPlaylistUrl", () => {
  it("parses a standard Spotify playlist URL", () => {
    const result = parseSpotifyPlaylistUrl(
      "https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp",
    );
    expect(result.playlistId).toBe("7tXCYmr41YKXMgYyeo0jXp");
  });

  it("ignores query parameters such as si", () => {
    const result = parseSpotifyPlaylistUrl(
      "https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp?si=9732196fc5984f5d",
    );
    expect(result.playlistId).toBe("7tXCYmr41YKXMgYyeo0jXp");
  });

  it("ignores additional query parameters", () => {
    const result = parseSpotifyPlaylistUrl(
      "https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp?si=abc&utm_source=copy-link",
    );
    expect(result.playlistId).toBe("7tXCYmr41YKXMgYyeo0jXp");
  });

  it("trims whitespace", () => {
    const result = parseSpotifyPlaylistUrl(
      "  https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp  ",
    );
    expect(result.playlistId).toBe("7tXCYmr41YKXMgYyeo0jXp");
  });

  it.each([
    "",
    "   ",
    "not-a-url",
    "https://spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp",
    "http://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp",
    "https://open.spotify.com/artist/7tXCYmr41YKXMgYyeo0jXp",
    "https://open.spotify.com/album/7tXCYmr41YKXMgYyeo0jXp",
    "https://open.spotify.com/playlist/",
    "https://open.spotify.com/playlist/short",
    "https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp!extra",
    "https://evil.com/open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp",
    "https://open.spotify.com.evil.com/playlist/7tXCYmr41YKXMgYyeo0jXp",
  ])("rejects malformed URL: %s", (url) => {
    expect(() => parseSpotifyPlaylistUrl(url)).toThrow();
  });

  it("throws a clear validation error", () => {
    expect(() => parseSpotifyPlaylistUrl("")).toThrow("Spotify playlist URL is required");
    expect(() => parseSpotifyPlaylistUrl("https://example.com")).toThrow(
      "Expected format: https://open.spotify.com/playlist/{playlistId}",
    );
  });
});

describe("isSpotifyUrl", () => {
  it("returns true for open.spotify.com URLs", () => {
    expect(isSpotifyUrl("https://open.spotify.com/playlist/7tXCYmr41YKXMgYyeo0jXp")).toBe(true);
    expect(isSpotifyUrl("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh")).toBe(true);
  });

  it("returns false for non-Spotify domains", () => {
    expect(isSpotifyUrl("https://example.com")).toBe(false);
    expect(isSpotifyUrl("https://spotify.com.evil.com/")).toBe(false);
    expect(isSpotifyUrl("not-a-url")).toBe(false);
    expect(isSpotifyUrl("")).toBe(false);
  });
});

describe("normalizeString", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeString("  Hello   World  ")).toBe("hello world");
  });

  it("removes punctuation", () => {
    expect(normalizeString("Hello, World!")).toBe("hello world");
  });

  it("handles null/undefined", () => {
    expect(normalizeString(null)).toBe("");
    expect(normalizeString(undefined)).toBe("");
    expect(normalizeString("")).toBe("");
  });
});

describe("normalizeArtists", () => {
  it("normalizes and sorts artists", () => {
    expect(normalizeArtists(["The Beatles", "John Lennon"])).toBe(
      "john lennon the beatles",
    );
  });

  it("handles empty array", () => {
    expect(normalizeArtists([])).toBe("");
  });
});

describe("createSpotifyPlaylistTrack", () => {
  it("creates a track with unmatched status", () => {
    const track = createSpotifyPlaylistTrack(
      {
        spotifyTrackId: "4iV5W9uYEdYUVa79Axb7Rh",
        spotifyTrackUri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
        title: "Neon Afterglow",
        artists: ["Kairo Bloom"],
        album: "Afterimage",
        durationMs: 218000,
        artworkUrl: "https://i.scdn.co/image/abcd",
        position: 0,
      },
      "7tXCYmr41YKXMgYyeo0jXp",
    );

    expect(track.matchStatus).toBe("unmatched");
    expect(track.matchedTrackId).toBeNull();
    expect(track.spotifyPlaylistId).toBe("7tXCYmr41YKXMgYyeo0jXp");
    expect(track.title).toBe("Neon Afterglow");
    expect(track.position).toBe(0);
    expect(track.entryId).toBeDefined();
    expect(track.spotifyTrackId).toBe("4iV5W9uYEdYUVa79Axb7Rh");
  });

  it("validates against SpotifyPlaylistTrackSchema", () => {
    const track = createSpotifyPlaylistTrack(
      {
        spotifyTrackId: null,
        spotifyTrackUri: null,
        title: "Test",
        artists: [],
        album: null,
        durationMs: null,
        artworkUrl: null,
        position: 0,
      },
      "7tXCYmr41YKXMgYyeo0jXp",
    );
    const result = SpotifyPlaylistTrackSchema.safeParse(track);
    expect(result.success).toBe(true);
  });
});

describe("MatchStatusSchema", () => {
  it.each(["matched", "unmatched", "ambiguous", "unavailable"])("accepts %s", (s) => {
    expect(MatchStatusSchema.safeParse(s).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(MatchStatusSchema.safeParse("unknown").success).toBe(false);
  });
});
