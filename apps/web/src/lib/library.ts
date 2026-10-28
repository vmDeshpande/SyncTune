import { parseBlob } from "music-metadata-browser";
import { libraryStorage, audioStorage } from "./storage";
import type { Track } from "../../../../packages/contracts/src/index";
import { v4 as uuidv4 } from "uuid";

export async function importFiles(files: File[]): Promise<{ imported: Track[]; errors: string[] }> {
  const imported: Track[] = [];
  const errors: string[] = [];
  const existing = await libraryStorage.listTracks();
  for (const file of files) {
    try {
      const meta = await parseBlob(file).catch(() => null);
      const title = meta?.common.title ?? file.name.replace(/\.[^.]+$/, "");
      const artist = meta?.common.artist ?? "Unknown artist";
      const album = meta?.common.album ?? "Unknown album";
      const durationMs = meta?.format.duration ? Math.round(meta.format.duration * 1000) : null;
      const trackNumber = meta?.common.track?.no ?? null;
      const mimeType = file.type || null;
      const duplicate = existing.find((t) => t.title === title && t.artist === artist && t.fileSize === file.size);
      if (duplicate) {
        errors.push(`Skipped duplicate: ${file.name}`);
        continue;
      }
      const trackId = uuidv4();
      let audioStored = false;
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          await audioStorage.saveAudio(trackId, arrayBuffer);
          audioStored = true;
        }
      } catch {
        // Audio persistence is best-effort. The track is still imported as metadata,
        // but will not be playable until audio data is available.
      }
      const track: Track = {
        id: trackId,
        title,
        artist,
        album,
        durationMs,
        trackNumber,
        mimeType,
        fileSize: file.size,
        artworkRef: null,
        sourceType: "browser-file",
        importedAt: new Date().toISOString(),
        fingerprint: null,
        available: audioStored,
        metadataStatus: meta ? "complete" : "partial",
      };
      await libraryStorage.saveTrack(track);
      imported.push(track);
    } catch (e) {
      errors.push(`Failed: ${file.name}`);
    }
  }
  return { imported, errors };
}
