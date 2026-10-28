import { libraryStorage } from "./storage";
import { spotifyService, SpotifyAuthError } from "./spotify";
import { parseSpotifyPlaylistUrl } from "../../../../packages/contracts/src/spotify";
import { matchPlaylistTracks, applyMatches } from "../../../../packages/contracts/src/spotify-matching";
import type { Track, Playlist } from "../../../../packages/contracts/src/index";
import type { SpotifyPlaylistTrack } from "../../../../packages/contracts/src/spotify";
import { v4 as uuidv4 } from "uuid";

export interface SpotifyImportResult {
  playlist: Playlist;
  spotifyTracks: SpotifyPlaylistTrack[];
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  unavailableCount: number;
}

export async function importSpotifyPlaylist(
  playlistUrl: string,
  libraryTracks: Track[],
): Promise<SpotifyImportResult> {
  let spotifyPlaylistId: string;
  try {
    const parsed = parseSpotifyPlaylistUrl(playlistUrl);
    spotifyPlaylistId = parsed.playlistId;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Invalid Spotify playlist URL");
  }

  if (!spotifyService.isConfigured()) {
    throw new SpotifyAuthError(
      "Spotify is not configured. Please set VITE_SPOTIFY_CLIENT_ID and configure your Spotify Developer Dashboard.",
      true,
    );
  }

  const { playlist: spotifyPlaylist, tracks: spotifyTracks } =
    await spotifyService.importPlaylist(spotifyPlaylistId);

  const matchResults = matchPlaylistTracks(spotifyTracks, libraryTracks);
  const updatedTracks = applyMatches(spotifyTracks, matchResults);

  const matchedCount = updatedTracks.filter((t) => t.matchStatus === "matched").length;
  const unmatchedCount = updatedTracks.filter((t) => t.matchStatus === "unmatched").length;
  const ambiguousCount = updatedTracks.filter((t) => t.matchStatus === "ambiguous").length;
  const unavailableCount = updatedTracks.filter((t) => t.matchStatus === "unavailable").length;

  const matchedTrackIds = updatedTracks
    .filter((t) => t.matchStatus === "matched" && t.matchedTrackId)
    .map((t) => t.matchedTrackId!);

  const playlistId = uuidv4();
  const now = new Date().toISOString();

  const playlist: Playlist = {
    id: playlistId,
    name: spotifyPlaylist.name,
    description: spotifyPlaylist.description,
    trackIds: matchedTrackIds,
    createdAt: now,
    updatedAt: now,
    sourceMetadata: {
      sourceType: "spotify-metadata",
      spotifyPlaylistId: spotifyPlaylist.id,
      spotifyPlaylistName: spotifyPlaylist.name,
      artworkUrl: spotifyPlaylist.artworkUrl,
      totalTracks: spotifyPlaylist.totalTracks,
      spotifyTracks: updatedTracks.map((t) => ({
        entryId: t.entryId,
        spotifyTrackId: t.spotifyTrackId,
        spotifyTrackUri: t.spotifyTrackUri,
        title: t.title,
        artists: t.artists,
        album: t.album,
        durationMs: t.durationMs,
        artworkUrl: t.artworkUrl,
        position: t.position,
        matchedTrackId: t.matchedTrackId,
        matchStatus: t.matchStatus,
        matchReason: t.matchReason,
      })),
      matchSummary: {
        matched: matchedCount,
        unmatched: unmatchedCount,
        ambiguous: ambiguousCount,
        unavailable: unavailableCount,
      },
    },
  };

  await libraryStorage.savePlaylist(playlist);

  return {
    playlist,
    spotifyTracks: updatedTracks,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    unavailableCount,
  };
}

export async function refreshSpotifyPlaylist(
  playlist: Playlist,
  libraryTracks: Track[],
): Promise<SpotifyImportResult> {
  const sourceMeta = playlist.sourceMetadata as
    | { spotifyPlaylistId?: string }
    | undefined;

  if (!sourceMeta?.spotifyPlaylistId) {
    throw new Error("This playlist is not a Spotify import");
  }

  return importSpotifyPlaylist(
    `https://open.spotify.com/playlist/${sourceMeta.spotifyPlaylistId}`,
    libraryTracks,
  );
}

export function getSpotifyPlaylistTracks(playlist: Playlist): SpotifyPlaylistTrack[] {
  const sourceMeta = playlist.sourceMetadata as
    | { spotifyTracks?: SpotifyPlaylistTrack[] }
    | undefined;
  return sourceMeta?.spotifyTracks ?? [];
}

export function isSpotifyPlaylist(playlist: Playlist): boolean {
  const sourceMeta = playlist.sourceMetadata as
    | { sourceType?: string }
    | undefined;
  return sourceMeta?.sourceType === "spotify-metadata";
}
