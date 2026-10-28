import { openDB, type IDBPDatabase } from "idb";
import type { Track, Playlist } from "../../../../packages/contracts/src/index";

const DB_NAME = "synctune";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", { keyPath: "id" });
        if (!db.objectStoreNames.contains("playlists")) db.createObjectStore("playlists", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export const libraryStorage = {
  async listTracks(): Promise<Track[]> {
    const db = await getDb();
    return db.getAll("tracks");
  },
  async getTrack(id: string): Promise<Track | undefined> {
    const db = await getDb();
    return db.get("tracks", id);
  },
  async saveTrack(track: Track): Promise<void> {
    const db = await getDb();
    await db.put("tracks", track);
  },
  async removeTrack(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("tracks", id);
  },
  async listPlaylists(): Promise<Playlist[]> {
    const db = await getDb();
    return db.getAll("playlists");
  },
  async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await getDb();
    await db.put("playlists", playlist);
  },
  async removePlaylist(id: string): Promise<void> {
    const db = await getDb();
    await db.delete("playlists", id);
  },
};

const AUDIO_DB_NAME = "synctune-audio";
const AUDIO_DB_VERSION = 1;

let audioDbPromise: Promise<IDBPDatabase> | null = null;

function getAudioDb() {
  if (!audioDbPromise) {
    audioDbPromise = openDB(AUDIO_DB_NAME, AUDIO_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("audio")) {
          db.createObjectStore("audio", { keyPath: "id" });
        }
      },
    });
  }
  return audioDbPromise;
}

export const audioStorage = {
  async saveAudio(trackId: string, arrayBuffer: ArrayBuffer): Promise<void> {
    const db = await getAudioDb();
    await db.put("audio", { id: trackId, data: arrayBuffer, storedAt: new Date().toISOString() });
  },
  async getAudio(trackId: string): Promise<ArrayBuffer | undefined> {
    const db = await getAudioDb();
    const entry = await db.get("audio", trackId);
    return entry?.data;
  },
  async removeAudio(trackId: string): Promise<void> {
    const db = await getAudioDb();
    await db.delete("audio", trackId);
  },
  async audioExists(trackId: string): Promise<boolean> {
    const db = await getAudioDb();
    return (await db.get("audio", trackId)) !== undefined;
  },
};
