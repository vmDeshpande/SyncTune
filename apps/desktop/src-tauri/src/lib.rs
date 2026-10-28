use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{command, generate_context, Builder, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderSelectionResult {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CopyFileRequest {
    pub source: String,
    pub destination: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CopyFileResult {
    pub success: bool,
    pub destination: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub entry_id: String,
    pub spotify_track_id: Option<String>,
    pub title: String,
    pub artists: Vec<String>,
    pub matched_track_id: Option<String>,
    pub match_status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteManifestRequest {
    pub folder_path: String,
    pub playlist_name: String,
    pub spotify_playlist_id: String,
    pub entries: Vec<ManifestEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteManifestResult {
    pub success: bool,
    pub manifest_path: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SanitizePathRequest {
    pub input: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SanitizePathResult {
    pub sanitized: String,
}

#[command]
async fn open_directory<R: Runtime>(app: tauri::AppHandle<R>) -> Result<FolderSelectionResult, String> {
    let selected = app.dialog().file().pick_folder().await;
    match selected {
        Some(path) => {
            let path_str = path.to_string_lossy().to_string();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            Ok(FolderSelectionResult { path: path_str, name })
        }
        None => Err("No folder selected".to_string()),
    }
}

#[command]
fn sanitize_path_component(input: String) -> SanitizePathResult {
    // Replace unsafe characters with underscores
    let sanitized: String = input
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();

    // Collapse multiple underscores
    let collapsed: String = sanitized
        .chars()
        .fold(String::new(), |mut acc, c| {
            if c == '_' && acc.ends_with('_') {
                acc
            } else {
                acc.push(c);
                acc
            }
        })
        .trim_end_matches('_')
        .to_string();

    // Prevent path traversal
    let safe = if collapsed.contains("..") {
        collapsed.replace("..", "_")
    } else {
        collapsed
    };

    SanitizePathResult { sanitized: safe }
}

fn is_within_base(base: &Path, target: &Path) -> bool {
    match target.strip_prefix(base) {
        Ok(relative) => !relative.starts_with("..") && !relative.is_absolute(),
        Err(_) => false,
    }
}

#[command]
async fn create_folder(base_path: String, folder_name: String) -> Result<String, String> {
    let base = Path::new(&base_path);
    let safe_name = sanitize_path_component(folder_name.clone()).sanitized;

    if safe_name.is_empty() || safe_name == "." || safe_name == ".." {
        return Err("Invalid folder name".to_string());
    }

    let target = base.join(&safe_name);

    if !is_within_base(base, &target) {
        return Err("Path traversal detected".to_string());
    }

    if target.exists() {
        return Err(format!("Folder '{}' already exists", safe_name));
    }

    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;

    Ok(target.to_string_lossy().to_string())
}

#[command]
async fn copy_file(req: CopyFileRequest) -> Result<CopyFileResult, String> {
    let source = Path::new(&req.source);
    let destination = Path::new(&req.destination);

    if !source.exists() {
        return Ok(CopyFileResult {
            success: false,
            destination: req.destination,
            error: Some("Source file does not exist".to_string()),
        });
    }

    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if destination.exists() {
        return Ok(CopyFileResult {
            success: false,
            destination: req.destination,
            error: Some("Destination file already exists".to_string()),
        });
    }

    match std::fs::copy(source, destination) {
        Ok(_) => Ok(CopyFileResult {
            success: true,
            destination: req.destination,
            error: None,
        }),
        Err(e) => Ok(CopyFileResult {
            success: false,
            destination: req.destination,
            error: Some(e.to_string()),
        }),
    }
}

#[command]
async fn write_manifest(req: WriteManifestRequest) -> Result<WriteManifestResult, String> {
    let folder = Path::new(&req.folder_path);
    if !folder.exists() {
        return Ok(WriteManifestResult {
            success: false,
            manifest_path: req.folder_path,
            error: Some("Destination folder does not exist".to_string()),
        });
    }

    let manifest = serde_json::json!({
        "version": "1.0",
        "playlist_name": req.playlist_name,
        "spotify_playlist_id": req.spotify_playlist_id,
        "created_at": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        "entries": req.entries,
    });

    let manifest_path = folder.join("synctune-playlist.json");
    std::fs::write(&manifest_path, serde_json::to_string_pretty(&manifest).unwrap_or_default())
        .map_err(|e| e.to_string())?;

    Ok(WriteManifestResult {
        success: true,
        manifest_path: manifest_path.to_string_lossy().to_string(),
        error: None,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_directory,
            sanitize_path_component,
            create_folder,
            copy_file,
            write_manifest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
