import { describe, expect, it } from "vitest";
import type { Track } from "./index";
import {
  matchSpotifyTrackToLibrary,
  matchPlaylistTracks,
  applyMatches,
  defaultMatchOptions,
  type MatchOptions,
  type MatchResult,
} from "./spotify-matching";
import { createSpotifyPlaylistTrack } from "./spotify";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
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
  };
}

function makeSpotifyTrack(overrides: Partial<Parameters<typeof createSpotifyPlaylistTrack>[0]> = {}): ReturnType<typeof createSpotifyPlaylistTrack> {
  return createSpotifyPlaylistTrack(
    {
      spotifyTrackId: "4iV5W9uYEdYUVa79Axb7Rh",
      spotifyTrackUri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
      title: "Neon Afterglow",
      artists: ["Kairo Bloom"],
      album: "Afterimage",
      durationMs: 218000,
      artworkUrl: null,
      position: 0,
      ...overrides,
    },
    "playlist-1",
  );
}

describe("matchSpotifyTrackToLibrary", () => {
  it("returns exact match for same title and artist", () => {
    const spotifyTrack = makeSpotifyTrack();
    const library = [makeTrack()];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("matched");
    expect(result.matchedTrackId).toBe("track-1");
    expect(result.matchReason).toContain("Matched:");
  });

  it("handles case differences", () => {
    const spotifyTrack = makeSpotifyTrack({ title: "NEON AFTERGLOW", artists: ["KAIRO BLOOM"] });
    const library = [makeTrack()];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("matched");
    expect(result.matchedTrackId).toBe("track-1");
  });

  it("handles extra whitespace", () => {
    const spotifyTrack = makeSpotifyTrack({ title: "  Neon   Afterglow  ", artists: ["  Kairo   Bloom  "] });
    const library = [makeTrack()];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("matched");
  });

  it("returns unmatched when no library tracks", () => {
    const spotifyTrack = makeSpotifyTrack();
    const result = matchSpotifyTrackToLibrary(spotifyTrack, []);

    expect(result.matchStatus).toBe("unmatched");
    expect(result.matchedTrackId).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("returns unmatched when title and artist differ", () => {
    const spotifyTrack = makeSpotifyTrack({ title: "Completely Different Song", artists: ["Unknown Artist"] });
    const library = [makeTrack()];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("unmatched");
    expect(result.matchedTrackId).toBeNull();
  });

  it("returns ambiguous when multiple tracks match closely", () => {
    const spotifyTrack = makeSpotifyTrack({ title: "Song", artists: ["Artist"] });
    const library = [
      makeTrack({ id: "track-1", title: "Song", artist: "Artist" }),
      makeTrack({ id: "track-2", title: "Song", artist: "Artist", album: "Different Album" }),
    ];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("ambiguous");
    expect(result.matchedTrackId).toBeNull();
    expect(result.candidates.length).toBe(2);
  });

  it("uses duration as secondary signal", () => {
    const spotifyTrack = makeSpotifyTrack({ durationMs: 218000 });
    const exactDuration = makeTrack({ id: "exact", title: "Neon Afterglow", artist: "Kairo Bloom", durationMs: 218000 });
    const differentDuration = makeTrack({ id: "diff", title: "Completely Different Song", artist: "Other Artist", durationMs: 300000 });
    const result = matchSpotifyTrackToLibrary(spotifyTrack, [differentDuration, exactDuration]);

    expect(result.matchStatus).toBe("matched");
    expect(result.matchedTrackId).toBe("exact");
  });

  it("rejects low-confidence matches below threshold", () => {
    const spotifyTrack = makeSpotifyTrack({ title: "Somewhat Similar", artists: ["Kairo Bloom"] });
    const library = [makeTrack({ title: "Completely Different", artist: "Other Artist" })];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("unmatched");
    expect(result.matchedTrackId).toBeNull();
  });

  it("uses custom confidence threshold to reject perfect match", () => {
    const spotifyTrack = makeSpotifyTrack({ title: "Neon Afterglow", artists: ["Kairo Bloom"] });
    const library = [makeTrack()];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library, {
      minConfidenceScore: 1.01,
    });

    expect(result.matchStatus).toBe("unmatched");
    expect(result.matchedTrackId).toBeNull();
  });

  it("prefers higher-scored candidate", () => {
    const spotifyTrack = makeSpotifyTrack({
      title: "Neon Afterglow",
      artists: ["Kairo Bloom"],
      album: "Afterimage",
    });
    const exactMatch = makeTrack({ id: "exact", title: "Neon Afterglow", artist: "Kairo Bloom", album: "Afterimage" });
    const partialMatch = makeTrack({ id: "partial", title: "Neon Afterglow", artist: "Different Artist" });
    const result = matchSpotifyTrackToLibrary(spotifyTrack, [partialMatch, exactMatch]);

    expect(result.matchStatus).toBe("matched");
    expect(result.matchedTrackId).toBe("exact");
  });

  it("handles missing album metadata gracefully", () => {
    const spotifyTrack = makeSpotifyTrack({ album: null });
    const library = [makeTrack({ album: "Afterimage" })];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("matched");
  });

  it("handles missing duration gracefully", () => {
    const spotifyTrack = makeSpotifyTrack({ durationMs: null });
    const library = [makeTrack()];
    const result = matchSpotifyTrackToLibrary(spotifyTrack, library);

    expect(result.matchStatus).toBe("matched");
  });
});

describe("matchPlaylistTracks", () => {
  it("matches all tracks in order", () => {
    const spotifyTracks = [
      makeSpotifyTrack({ position: 0, title: "Song A", artists: ["Artist A"] }),
      makeSpotifyTrack({ position: 1, title: "Song B", artists: ["Artist B"] }),
    ];
    const library = [
      makeTrack({ id: "a", title: "Song A", artist: "Artist A" }),
      makeTrack({ id: "b", title: "Song B", artist: "Artist B" }),
    ];
    const results = matchPlaylistTracks(spotifyTracks, library);

    expect(results.length).toBe(2);
    expect(results[0].matchedTrackId).toBe("a");
    expect(results[1].matchedTrackId).toBe("b");
    expect(results[0].matchStatus).toBe("matched");
    expect(results[1].matchStatus).toBe("matched");
  });
});

describe("applyMatches", () => {
  it("applies match results to spotify tracks", () => {
    const spotifyTracks = [makeSpotifyTrack({ position: 0 })];
    const results = matchPlaylistTracks(spotifyTracks, [makeTrack()]);
    const updated = applyMatches(spotifyTracks, results);

    expect(updated[0].matchStatus).toBe("matched");
    expect(updated[0].matchedTrackId).toBe("track-1");
  });
});

describe("defaultMatchOptions", () => {
  it("has expected defaults", () => {
    expect(defaultMatchOptions.durationToleranceMs).toBe(5000);
    expect(defaultMatchOptions.requireAlbumMatch).toBe(false);
    expect(defaultMatchOptions.minConfidenceScore).toBe(0.7);
  });
});
