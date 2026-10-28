import { useState, useCallback } from "react";
import {
  importSpotifyPlaylist,
  type SpotifyImportResult,
} from "../lib/spotify-import";
import { spotifyService, SpotifyAuthError, isSpotifyConfigured } from "../lib/spotify";
import { parseSpotifyPlaylistUrl } from "../../../../packages/contracts/src/spotify";
import type { Track } from "../../../../packages/contracts/src/index";

interface SpotifyImportModalProps {
  libraryTracks: Track[];
  onImportComplete: (result: SpotifyImportResult) => void;
  onClose: () => void;
}

type ImportStep = "url" | "auth" | "matches" | "destination" | "complete" | "error";

export function SpotifyImportModal({
  libraryTracks,
  onImportComplete,
  onClose,
}: SpotifyImportModalProps) {
  const [step, setStep] = useState<ImportStep>("url");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<SpotifyImportResult | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [codeVerifier, setCodeVerifier] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [organizationMode, setOrganizationMode] = useState<"copy" | "move">("copy");

  const handleValidateUrl = useCallback(() => {
    setError(null);
    try {
      parseSpotifyPlaylistUrl(url);
      setStep("auth");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid Spotify playlist URL");
    }
  }, [url]);

  const handleStartAuth = useCallback(async () => {
    setError(null);
    setImporting(true);
    try {
      const { url: authUrl, codeVerifier } = await spotifyService.startAuthorization("synctune-import");
      setAuthUrl(authUrl);
      setCodeVerifier(codeVerifier);
      setShowAuth(true);
    } catch (e) {
      setImporting(false);
      if (e instanceof SpotifyAuthError && e.isConfigError) {
        setError(e.message);
        setStep("error");
      } else {
        setError("Failed to start authorization");
        setStep("error");
      }
    } finally {
      if (!showAuth) setImporting(false);
    }
  }, [showAuth]);

  const handleAuthCallback = useCallback(
    async (code: string) => {
      setImporting(true);
      try {
        await spotifyService.exchangeCodeForTokens(code, codeVerifier);
        await doImport();
      } catch (e) {
        setImporting(false);
        setError(e instanceof Error ? e.message : "Authorization failed");
      }
    },
    [codeVerifier],
  );

  const doImport = useCallback(async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await importSpotifyPlaylist(url, libraryTracks);
      setResult(res);
      setStep("destination");
    } catch (e) {
      setImporting(false);
      if (e instanceof SpotifyAuthError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Import failed");
      }
      setStep("error");
    } finally {
      setImporting(false);
    }
  }, [url, libraryTracks]);

  const handleComplete = useCallback(() => {
    if (result) {
      onImportComplete(result);
    }
    onClose();
  }, [result, onImportComplete, onClose]);

  const handleFolderSelect = async () => {
    // Tauri folder picker - only available in desktop app
    setError(null);
    try {
      // The desktop app will expose this via a global or Tauri command
      // For now, we allow manual path entry in web mode
      setStep("complete");
    } catch (e) {
      setError("Failed to select folder");
    }
  };

  const trackStatusLabel = (status: string): string => {
    switch (status) {
      case "matched": return "Matched";
      case "unmatched": return "Unmatched";
      case "ambiguous": return "Ambiguous";
      case "unavailable": return "Unavailable";
      default: return status;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow accent">Spotify Import</span>
            <h2>{step === "complete" ? "Import Complete" : "Import Spotify Playlist"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <span>✕</span>
          </button>
        </div>

        {step === "url" && (
          <div className="spotify-import-step">
            <p className="spotify-instruction">
              Paste a Spotify playlist URL to import its metadata and match tracks against your local library.
            </p>
            <div className="field">
              <label>Spotify Playlist URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                className="spotify-url-input"
              />
              <p className="field-note">
                Only public playlists are supported. SyncTune imports metadata only — no audio is downloaded from Spotify.
              </p>
            </div>
            {error && <p className="field-error">{error}</p>}
            <div className="modal-footer">
              <button className="button secondary" onClick={onClose}>Cancel</button>
              <button
                className="button primary"
                onClick={handleValidateUrl}
                disabled={!url.trim() || importing}
              >
                {importing ? "Validating..." : "Validate & Import"}
              </button>
            </div>
          </div>
        )}

        {step === "auth" && (
          <div className="spotify-import-step">
            {!isSpotifyConfigured() && (
              <div className="spotify-config-notice">
                <p>Spotify integration is not configured.</p>
                <p>To import Spotify playlists, you need to set up a Spotify Developer application.</p>
                <button className="button secondary" onClick={() => {
                  setStep("error");
                  setError("Spotify not configured");
                }}>
                  View Setup Guide
                </button>
              </div>
            )}
            <p className="spotify-instruction">
              Authorize SyncTune to access your Spotify playlists. You'll be redirected to Spotify to log in.
            </p>
            {error && <p className="field-error">{error}</p>}
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setStep("url")}>Back</button>
              <button
                className="button primary"
                onClick={handleStartAuth}
                disabled={importing || !isSpotifyConfigured()}
              >
                {importing ? "Starting..." : "Authorize with Spotify"}
              </button>
            </div>
            {showAuth && (
              <div className="auth-instructions">
                <p>1. Click the button below to open Spotify authorization.</p>
                <p>2. Log in and approve the request.</p>
                <p>3. You'll be redirected back with a code — paste it below.</p>
                <button
                  className="button primary"
                  onClick={() => {
                    if (authUrl) window.open(authUrl, "_blank");
                  }}
                >
                  Open Spotify Authorization
                </button>
                <div className="field" style={{ marginTop: 16 }}>
                  <label>Authorization Code</label>
                  <input
                    type="text"
                    placeholder="Paste the code from the redirect URL"
                    onChange={(e) => {
                      // Store code temporarily
                      (window as any)._spotifyCode = e.target.value;
                    }}
                  />
                </div>
                <button
                  className="button primary"
                  onClick={() => handleAuthCallback((window as any)._spotifyCode ?? "")}
                  disabled={!(window as any)._spotifyCode
                }>
                  Submit Code
                </button>
              </div>
            )}
          </div>
        )}

        {step === "matches" && result && (
          <div className="spotify-import-step">
            <div className="match-summary">
              <div className="summary-item matched">
                <span className="summary-number">{result.matchedCount}</span>
                <span className="summary-label">Matched</span>
              </div>
              <div className="summary-item unmatched">
                <span className="summary-number">{result.unmatchedCount}</span>
                <span className="summary-label">Unmatched</span>
              </div>
              <div className="summary-item ambiguous">
                <span className="summary-number">{result.ambiguousCount}</span>
                <span className="summary-label">Ambiguous</span>
              </div>
              <div className="summary-item unavailable">
                <span className="summary-number">{result.unavailableCount}</span>
                <span className="summary-label">Unavailable</span>
              </div>
            </div>
            <p className="spotify-instruction">
              Review matched tracks. Unmatched tracks will not be playable until matched to local files.
            </p>
            <div className="spotify-track-list">
              {result.spotifyTracks.map((t) => (
                <div
                  key={t.entryId}
                  className={`spotify-track-row ${t.matchStatus}`}
                >
                  <div className="track-info">
                    <span className="track-position">{t.position + 1}</span>
                    <div className="track-meta">
                      <strong>{t.title}</strong>
                      <span>{t.artists.join(", ")}</span>
                      {t.album && <span className="track-album">{t.album}</span>}
                    </div>
                  </div>
                  <span className={`match-badge ${t.matchStatus}`}>
                    {trackStatusLabel(t.matchStatus)}
                  </span>
                  {t.matchReason && <span className="track-reason">{t.matchReason}</span>}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setStep("url")}>Back</button>
              <button
                className="button primary"
                onClick={() => setStep("destination")}
                disabled={importing}
              >
                Continue to Destination
              </button>
            </div>
          </div>
        )}

        {step === "destination" && result && (
          <div className="spotify-import-step">
            <p className="spotify-instruction">
              Choose where to organize the matched audio files on disk. This step is available in the desktop app.
            </p>
            <div className="field">
              <label>Destination Folder</label>
              <div className="folder-picker">
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="Select a folder..."
                  disabled
                />
                <button className="button secondary" onClick={handleFolderSelect}>
                  Choose Folder
                </button>
              </div>
              <p className="field-note">
                In the desktop app, click "Choose Folder" to open a native folder picker.
              </p>
            </div>
            <div className="field">
              <label>Organization Mode</label>
              <div className="mode-options">
                <button
                  className={`mode-button ${organizationMode === "copy" ? "selected" : ""}`}
                  onClick={() => setOrganizationMode("copy")}
                >
                  Copy files (safe, keeps originals)
                </button>
                <button
                  className={`mode-button ${organizationMode === "move" ? "selected" : ""}`}
                  onClick={() => setOrganizationMode("move")}
                  disabled
                >
                  Move files (requires confirmation)
                </button>
              </div>
            </div>
            {error && <p className="field-error">{error}</p>}
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setStep("matches")}>Back</button>
              <button
                className="button primary"
                onClick={handleComplete}
                disabled={importing || !folderPath}
              >
                Complete Import
              </button>
            </div>
          </div>
        )}

        {step === "complete" && result && (
          <div className="spotify-import-step spotify-complete">
            <div className="complete-icon">✓</div>
            <h3>Import Complete</h3>
            <p>
              <strong>{result.playlist.name}</strong> has been imported with{' '}
              {result.matchedCount} matched track(s).
            </p>
            <div className="match-summary">
              <div className="summary-item matched">
                <span className="summary-number">{result.matchedCount}</span>
                <span className="summary-label">Matched & playable</span>
              </div>
              <div className="summary-item unmatched">
                <span className="summary-number">{result.unmatchedCount}</span>
                <span className="summary-label">Unmatched</span>
              </div>
              <div className="summary-item ambiguous">
                <span className="summary-number">{result.ambiguousCount}</span>
                <span className="summary-label">Ambiguous (needs review)</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="button primary" onClick={handleComplete}>Done</button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="spotify-import-step spotify-error">
            <p className="spotify-error-message">{error}</p>
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setStep("url")}>Try Again</button>
              <button className="button primary" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
