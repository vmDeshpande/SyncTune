import type { Track as CanonicalTrack } from "../../../../packages/contracts/src/index";

export interface UiTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  added: string;
  cover: string;
}

export function toUiTrack(t: CanonicalTrack): UiTrack {
  const duration = t.durationMs
    ? `${Math.floor(t.durationMs / 60000)}:${String(Math.floor((t.durationMs % 60000) / 1000)).padStart(2, "0")}`
    : "0:00";
  const added = new Date(t.importedAt).toLocaleDateString();
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration,
    added,
    cover: t.artworkRef ?? "/artwork/neon-afterglow.png",
  };
}
