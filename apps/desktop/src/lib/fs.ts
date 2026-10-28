import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/plugin-dialog";

export interface FolderSelectionResult {
  path: string;
  name: string;
}

export interface CopyFileResult {
  success: boolean;
  destination: string;
  error: string | null;
}

export interface ManifestEntry {
  entry_id: string;
  spotify_track_id: string | null;
  title: string;
  artists: string[];
  matched_track_id: string | null;
  match_status: string;
}

export interface WriteManifestRequest {
  folder_path: string;
  playlist_name: string;
  spotify_playlist_id: string;
  entries: ManifestEntry[];
}

export interface WriteManifestResult {
  success: boolean;
  manifest_path: string;
  error: string | null;
}

export interface SanitizePathResult {
  sanitized: string;
}

let isTauri = false;

function ensureTauri(): void {
  if (!isTauri) {
    throw new Error("Tauri APIs are only available in the desktop app");
  }
}

export function isTauriAvailable(): boolean {
  return isTauri;
}

export function setTauriAvailable(value: boolean): void {
  isTauri = value;
}

export async function pickFolder(): Promise<FolderSelectionResult | null> {
  ensureTauri();
  try {
    const result = await invoke<FolderSelectionResult>("open_directory");
    return result;
  } catch (e) {
    return null;
  }
}

export async function sanitizePathComponent(input: string): Promise<string> {
  ensureTauri();
  const result = await invoke<SanitizePathResult>("sanitize_path_component", { input });
  return result.sanitized;
}

export async function createFolder(basePath: string, folderName: string): Promise<string> {
  ensureTauri();
  return invoke<string>("create_folder", { basePath, folderName });
}

export async function copyFile(source: string, destination: string): Promise<CopyFileResult> {
  ensureTauri();
  return invoke<CopyFileResult>("copy_file", { source, destination });
}

export async function writeManifest(req: WriteManifestRequest): Promise<WriteManifestResult> {
  ensureTauri();
  return invoke<WriteManifestResult>("write_manifest", req);
}

export async function openFolderDialog(): Promise<string | null> {
  ensureTauri();
  try {
    const selected = await open({ multiple: false, directory: true });
    if (selected === null) return null;
    return String(selected);
  } catch {
    return null;
  }
}
