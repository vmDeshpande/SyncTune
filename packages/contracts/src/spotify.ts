import { z } from "zod";

export const SpotifyPlaylistUrlSchema = z.object({
  playlistId: z.string(),
});

export type SpotifyPlaylistUrl = z.infer<typeof SpotifyPlaylistUrlSchema>;

// Spotify playlist IDs are 22-character base62 strings (alphanumeric).
const SPOTIFY_PLAYLIST_ID_RE = /^[a-zA-Z0-9]{22}$/;

// Matches https://open.spotify.com/playlist/{id} optionally followed by query params.
const SPOTIFY_PLAYLIST_URL_RE = /^https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]{22})(\?|$)/;

export function parseSpotifyPlaylistUrl(url: string): SpotifyPlaylistUrl {
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Spotify playlist URL is required");
  }

  const trimmed = url.trim();
  const match = trimmed.match(SPOTIFY_PLAYLIST_URL_RE);

  if (!match) {
    throw new Error(
      "Invalid Spotify playlist URL. Expected format: https://open.spotify.com/playlist/{playlistId}",
    );
  }

  const playlistId = match[1];

  if (!SPOTIFY_PLAYLIST_ID_RE.test(playlistId)) {
    throw new Error("Invalid Spotify playlist ID");
  }

  return { playlistId };
}

export function isSpotifyUrl(url: string): boolean {
  try {
    new URL(url);
    return /^https:\/\/open\.spotify\.com\//.test(url.trim());
  } catch {
    return false;
  }
}

export const MatchStatusSchema = z.enum(["matched", "unmatched", "ambiguous", "unavailable"]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const SpotifyPlaylistTrackSchema = z.object({
  entryId: z.string().uuid(),
  spotifyPlaylistId: z.string(),
  spotifyTrackId: z.string().nullable(),
  spotifyTrackUri: z.string().nullable(),
  title: z.string(),
  artists: z.array(z.string()),
  album: z.string().nullable(),
  durationMs: z.number().nullable(),
  artworkUrl: z.string().nullable(),
  position: z.number().int().nonnegative(),
  matchedTrackId: z.string().uuid().nullable(),
  matchStatus: MatchStatusSchema,
  matchReason: z.string().nullable(),
});

export type SpotifyPlaylistTrack = z.infer<typeof SpotifyPlaylistTrackSchema>;

export const SpotifyPlaylistSchema = z.object({
  id: z.string().uuid(),
  spotifyPlaylistId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  artworkUrl: z.string().nullable(),
  tracks: z.array(SpotifyPlaylistTrackSchema),
  totalTracks: z.number().int().nonnegative(),
  importedAt: z.string(),
  sourceFolderPath: z.string().nullable(),
  manifestVersion: z.string(),
});

export type SpotifyPlaylist = z.infer<typeof SpotifyPlaylistSchema>;

export const ManifestVersion = "1.0";

export interface SpotifyPlaylistEntryInput {
  spotifyTrackId: string | null;
  spotifyTrackUri: string | null;
  title: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  artworkUrl: string | null;
  position: number;
}

export function createSpotifyPlaylistTrack(
  input: SpotifyPlaylistEntryInput,
  spotifyPlaylistId: string,
): SpotifyPlaylistTrack {
  return {
    entryId: crypto.randomUUID?.() ?? "",
    spotifyPlaylistId,
    spotifyTrackId: input.spotifyTrackId,
    spotifyTrackUri: input.spotifyTrackUri,
    title: input.title,
    artists: input.artists,
    album: input.album,
    durationMs: input.durationMs,
    artworkUrl: input.artworkUrl,
    position: input.position,
    matchedTrackId: null,
    matchStatus: "unmatched",
    matchReason: null,
  };
}

export function normalizeString(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArtists(artists: string[]): string {
  return artists.map(normalizeString).sort().join(" ");
}
