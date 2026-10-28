import type { Track } from "./index";
import type { SpotifyPlaylistTrack } from "./spotify";
import { normalizeArtists, normalizeString } from "./spotify";

export const DEFAULT_DURATION_TOLERANCE_MS = 5000;

export interface MatchCandidate {
  track: Track;
  score: number;
  reasons: string[];
}

export interface MatchResult {
  spotifyTrack: SpotifyPlaylistTrack;
  matchedTrackId: string | null;
  matchStatus: SpotifyPlaylistTrack["matchStatus"];
  matchReason: string | null;
  candidates: MatchCandidate[];
}

export interface MatchOptions {
  durationToleranceMs?: number;
  requireAlbumMatch?: boolean;
  minConfidenceScore?: number;
}

export const defaultMatchOptions: Required<MatchOptions> = {
  durationToleranceMs: DEFAULT_DURATION_TOLERANCE_MS,
  requireAlbumMatch: false,
  minConfidenceScore: 0.7,
};

function titleMatchScore(spotifyTitle: string, trackTitle: string): number {
  const s = normalizeString(spotifyTitle);
  const t = normalizeString(trackTitle);
  if (s === "" || t === "") return 0;
  if (s === t) return 1.0;
  if (s.includes(t) || t.includes(s)) return 0.6;
  return 0;
}

function artistMatchScore(spotifyArtists: string[], trackArtist: string): number {
  const s = normalizeArtists(spotifyArtists);
  const t = normalizeString(trackArtist);
  if (s === "" || t === "") return 0;
  if (s === t) return 1.0;
  if (s.includes(t) || t.includes(s)) return 0.6;
  return 0;
}

function albumMatchScore(spotifyAlbum: string | null, trackAlbum: string): number {
  const s = normalizeString(spotifyAlbum);
  const t = normalizeString(trackAlbum);
  if (s === "" || t === "") return 0;
  if (s === t) return 1.0;
  if (s.includes(t) || t.includes(s)) return 0.5;
  return 0;
}

function durationScore(spotifyDurationMs: number | null, trackDurationMs: number | null, toleranceMs: number): number {
  if (spotifyDurationMs === null || trackDurationMs === null) return 0;
  const diff = Math.abs(spotifyDurationMs - trackDurationMs);
  if (diff <= toleranceMs) return 1.0;
  if (diff <= toleranceMs * 2) return 0.5;
  return 0;
}

export function matchSpotifyTrackToLibrary(
  spotifyTrack: SpotifyPlaylistTrack,
  libraryTracks: Track[],
  options: MatchOptions = {},
): MatchResult {
  const opts = { ...defaultMatchOptions, ...options };
  const candidates: MatchCandidate[] = [];

  for (const track of libraryTracks) {
    const titleScore = titleMatchScore(spotifyTrack.title, track.title);
    const artistScore = artistMatchScore(spotifyTrack.artists, track.artist);
    const albumScore = albumMatchScore(spotifyTrack.album, track.album ?? "");
    const durScore = durationScore(spotifyTrack.durationMs, track.durationMs, opts.durationToleranceMs);

    const reasons: string[] = [];
    if (titleScore > 0) reasons.push(`title:${titleScore.toFixed(2)}`);
    if (artistScore > 0) reasons.push(`artist:${artistScore.toFixed(2)}`);
    if (albumScore > 0) reasons.push(`album:${albumScore.toFixed(2)}`);
    if (durScore > 0) reasons.push(`duration:${durScore.toFixed(2)}`);

    // Weighted score: title and artist matter most
    const score =
      titleScore * 0.4 +
      artistScore * 0.4 +
      albumScore * 0.1 +
      durScore * 0.1;

    if (score > 0) {
      candidates.push({ track, score, reasons });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  let matchedTrackId: string | null = null;
  let matchStatus: SpotifyPlaylistTrack["matchStatus"] = "unmatched";
  let matchReason: string | null = null;

  if (candidates.length === 0) {
    matchStatus = "unmatched";
    matchReason = "No matching tracks found in local library";
  } else if (candidates.length === 1 && candidates[0].score >= opts.minConfidenceScore) {
    matchedTrackId = candidates[0].track.id;
    matchStatus = "matched";
    matchReason = `Matched: ${candidates[0].reasons.join(", ")}`;
  } else if (candidates[0].score >= opts.minConfidenceScore) {
    // Check if top candidate is clearly better than second
    const top = candidates[0];
    const second = candidates[1];
    const isAmbiguous = second.score >= top.score * 0.85;

    if (isAmbiguous) {
      matchStatus = "ambiguous";
      matchReason = `Multiple possible matches (${candidates.length})`;
    } else {
      matchedTrackId = top.track.id;
      matchStatus = "matched";
      matchReason = `Matched: ${top.reasons.join(", ")}`;
    }
  } else {
    matchStatus = "unmatched";
    matchReason = `Best match below confidence threshold (${candidates[0].score.toFixed(2)})`;
  }

  return {
    spotifyTrack,
    matchedTrackId,
    matchStatus,
    matchReason,
    candidates,
  };
}

export function matchPlaylistTracks(
  spotifyTracks: SpotifyPlaylistTrack[],
  libraryTracks: Track[],
  options: MatchOptions = {},
): MatchResult[] {
  return spotifyTracks.map((st) => matchSpotifyTrackToLibrary(st, libraryTracks, options));
}

export function applyMatches(
  spotifyTracks: SpotifyPlaylistTrack[],
  matchResults: MatchResult[],
): SpotifyPlaylistTrack[] {
  return spotifyTracks.map((st, index) => {
    const result = matchResults[index];
    return {
      ...st,
      matchedTrackId: result.matchedTrackId,
      matchStatus: result.matchStatus,
      matchReason: result.matchReason,
    };
  });
}
