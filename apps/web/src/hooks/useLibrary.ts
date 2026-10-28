import { useEffect, useState } from "react";
import { libraryStorage } from "../lib/storage";
import { importFiles } from "../lib/library";
import type { Track, Playlist } from "../../../../packages/contracts/src/index";

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setTracks(await libraryStorage.listTracks());
        setPlaylists(await libraryStorage.listPlaylists());
      } catch (e) {
        setError("Failed to load library");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function doImport(files: File[]) {
    setImporting(true);
    setError(null);
    try {
      const res = await importFiles(files);
      setTracks(await libraryStorage.listTracks());
      if (res.errors.length) setError(res.errors.join("; "));
    } catch (e) {
      setError("Import failed");
    } finally {
      setImporting(false);
    }
  }

  return { tracks, playlists, loading, importing, error, importFiles: doImport };
}
