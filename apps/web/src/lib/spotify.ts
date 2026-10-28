import {
  createSpotifyPlaylistTrack,
  SpotifyPlaylistEntryInput,
} from "../../../../packages/contracts/src/spotify";
import type { SpotifyPlaylistTrack } from "../../../../packages/contracts/src/spotify";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

const REDIRECT_URI = "http://localhost:1420/callback";

export interface SpotifyAuthConfig {
  clientId: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export class SpotifyAuthError extends Error {
  constructor(message: string, public readonly isConfigError: boolean = false) {
    super(message);
    this.name = "SpotifyAuthError";
  }
}

export class SpotifyApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

function getConfig(): SpotifyAuthConfig {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new SpotifyAuthError(
      "Spotify client ID is not configured. Set VITE_SPOTIFY_CLIENT_ID environment variable and add your redirect URI to your Spotify Developer Dashboard.",
      true,
    );
  }
  return {
    clientId,
    redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? REDIRECT_URI,
    scopes: ["playlist-read-private", "playlist-read-collaborative"],
  };
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class SpotifyService {
  private config: SpotifyAuthConfig;
  private tokens: SpotifyTokens | null = null;
  private codeVerifier: string | null = null;
  private onTokensChange: ((tokens: SpotifyTokens | null) => void) | null = null;

  constructor(config?: Partial<SpotifyAuthConfig>) {
    try {
      const base = getConfig();
      this.config = {
        clientId: config?.clientId ?? base.clientId,
        redirectUri: config?.redirectUri ?? base.redirectUri,
        scopes: config?.scopes ?? base.scopes,
      };
    } catch {
      this.config = {
        clientId: "",
        redirectUri: "",
        scopes: [],
      };
    }
  }

  isConfigured(): boolean {
    return this.config.clientId.length > 0;
  }

  setTokensChangeListener(callback: (tokens: SpotifyTokens | null) => void): void {
    this.onTokensChange = callback;
  }

  private notifyTokensChange(): void {
    this.onTokensChange?.(this.tokens);
  }

  async startAuthorization(state: string): Promise<{ url: string; codeVerifier: string }> {
    if (!this.isConfigured()) {
      throw new SpotifyAuthError("Spotify is not configured. Set VITE_SPOTIFY_CLIENT_ID.", true);
    }

    this.codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(this.codeVerifier);

    const params = new URLSearchParams();
    params.set("client_id", this.config.clientId);
    params.set("response_type", "code");
    params.set("redirect_uri", this.config.redirectUri ?? "");
    params.set("scope", (this.config.scopes ?? []).join(" "));
    params.set("code_challenge_method", "S256");
    params.set("code_challenge", codeChallenge);
    params.set("state", state);

    const url = `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
    return { url, codeVerifier: this.codeVerifier! };
  }

  async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<SpotifyTokens> {
    if (!this.isConfigured()) {
      throw new SpotifyAuthError("Spotify is not configured", true);
    }

    const params = new URLSearchParams();
    params.set("client_id", this.config.clientId);
    params.set("grant_type", "authorization_code");
    params.set("code", code);
    params.set("redirect_uri", this.config.redirectUri ?? "");
    params.set("code_verifier", codeVerifier);

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SpotifyAuthError(
        `Token exchange failed: ${response.status} ${body}`,
        false,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const tokens: SpotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    this.tokens = tokens;
    this.notifyTokensChange();
    return tokens;
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.tokens) {
      throw new SpotifyAuthError("Not authorized. Call startAuthorization() first.", false);
    }
    if (Date.now() >= this.tokens.expiresAt - 60000) {
      if (this.tokens.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new SpotifyAuthError("Access token expired and no refresh token available", false);
      }
    }
    return this.tokens!.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new SpotifyAuthError("No refresh token available", false);
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      this.tokens = null;
      this.notifyTokensChange();
      throw new SpotifyAuthError("Token refresh failed. Re-authorization required.", false);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    this.notifyTokensChange();
  }

  private async fetchSpotify<T>(path: string): Promise<T> {
    const token = await this.ensureValidToken();
    const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      if (this.tokens?.refreshToken) {
        await this.refreshAccessToken();
        return this.fetchSpotify<T>(path);
      }
      throw new SpotifyAuthError("Authorization failed. Re-authorization required.", false);
    }

    if (response.status === 429) {
      throw new SpotifyApiError("Spotify API rate limit exceeded. Please try again later.", 429);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SpotifyApiError(
        `Spotify API error: ${response.status} ${body}`,
        response.status,
      );
    }

    return response.json();
  }

  async fetchPlaylist(spotifyPlaylistId: string): Promise<{
    id: string;
    name: string;
    description: string | null;
    artworkUrl: string | null;
    totalTracks: number;
    owner: string;
  }> {
    const data = await this.fetchSpotify<any>(`/playlists/${spotifyPlaylistId}`);
    return {
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      artworkUrl: data.images?.[0]?.url ?? null,
      totalTracks: data.tracks?.total ?? 0,
      owner: data.owner?.display_name ?? data.owner?.id ?? "Unknown",
    };
  }

  async fetchPlaylistTracksPage(
    spotifyPlaylistId: string,
    offset: number,
    limit: number,
  ): Promise<{ items: SpotifyPlaylistTrack[]; next: string | null }> {
    const data = await this.fetchSpotify<any>(
      `/playlists/${spotifyPlaylistId}/tracks?offset=${offset}&limit=${limit}&fields=items(track(id,uri,name,artists(name),album(name,duration_ms),images),is_local,added_at),next`,
    );
    return this.mapPlaylistTracks(data, spotifyPlaylistId, offset);
  }

  async fetchAllPlaylistTracks(spotifyPlaylistId: string): Promise<SpotifyPlaylistTrack[]> {
    const allTracks: SpotifyPlaylistTrack[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const { items, next } = await this.fetchPlaylistTracksPage(spotifyPlaylistId, offset, limit);
      allTracks.push(...items);
      if (!next) break;
      offset += limit;
    }

    return allTracks;
  }

  private mapPlaylistTracks(
    data: any,
    spotifyPlaylistId: string,
    offset: number = 0,
  ): { items: SpotifyPlaylistTrack[]; next: string | null } {
    const rawItems = data?.items ?? [];
    const items: SpotifyPlaylistTrack[] = [];

    for (const [index, raw] of rawItems.entries()) {
      const track = raw?.track;
      if (!track) {
        items.push(
          createSpotifyPlaylistTrack(
            {
              spotifyTrackId: null,
              spotifyTrackUri: null,
              title: "Unavailable Track",
              artists: [],
              album: null,
              durationMs: null,
              artworkUrl: null,
              position: offset + index,
            },
            spotifyPlaylistId,
          ),
        );
        continue;
      }

      const isLocal = raw?.is_local ?? false;
      const artists = track.artists?.map((a: any) => a.name).filter(Boolean) ?? ["Unknown Artist"];
      const album = track.album?.name ?? null;
      const durationMs = track.album?.duration_ms ?? track.duration_ms ?? null;

      const input: SpotifyPlaylistEntryInput = {
        spotifyTrackId: track.id ?? null,
        spotifyTrackUri: track.uri ?? null,
        title: track.name ?? "Unknown Track",
        artists,
        album,
        durationMs,
        artworkUrl: track.album?.images?.[0]?.url ?? null,
        position: offset + index,
      };

      const spotifyTrack = createSpotifyPlaylistTrack(input, spotifyPlaylistId);

      if (isLocal) {
        spotifyTrack.matchStatus = "unavailable";
        spotifyTrack.matchReason = "Local Spotify track - not available as local audio file";
      }

      items.push(spotifyTrack);
    }

    return {
      items,
      next: data?.next ?? null,
    };
  }

  async importPlaylist(spotifyPlaylistId: string): Promise<{
    playlist: {
      id: string;
      name: string;
      description: string | null;
      artworkUrl: string | null;
      totalTracks: number;
    };
    tracks: SpotifyPlaylistTrack[];
  }> {
    const playlist = await this.fetchPlaylist(spotifyPlaylistId);
    const tracks = await this.fetchAllPlaylistTracks(spotifyPlaylistId);
    return { playlist, tracks };
  }

  logout(): void {
    this.tokens = null;
    this.codeVerifier = null;
    this.notifyTokensChange();
  }

  getTokens(): SpotifyTokens | null {
    return this.tokens;
  }
}

export const spotifyService = new SpotifyService();

export function isSpotifyConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

export function spotifySetupGuide(): string {
  return `
Spotify Integration Setup

1. Create a Spotify Developer application at https://developer.spotify.com/dashboard
2. Add a Redirect URI: http://localhost:1420/callback (for local development)
   or your production domain/callback URL
3. Copy your Client ID
4. Create a .env file in apps/web/ with:
   VITE_SPOTIFY_CLIENT_ID=your_client_id_here
   VITE_SPOTIFY_REDIRECT_URI=http://localhost:1420/callback
5. Restart the development server

Note: SyncTune imports Spotify metadata only. It does not download or play Spotify audio.
Matched tracks must already exist in your local SyncTune library.
`;
}
