import { audioStorage, libraryStorage } from "./storage";
import type { Track } from "../../../../packages/contracts/src/index";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "stopped";

export interface PlaybackState {
  readonly currentTrackId: string | null;
  readonly status: PlaybackStatus;
  readonly currentTime: number;
  readonly duration: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly queue: readonly string[];
  readonly error: string | null;
}

const initialState: PlaybackState = {
  currentTrackId: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  queue: [],
  error: null,
};

type AudioFactory = () => HTMLAudioElement;

interface PlaybackControllerOptions {
  audioFactory?: AudioFactory;
}

export class PlaybackController {
  private readonly audioFactory: AudioFactory;
  private readonly onLoadedMetadata = () => this.handleLoadedMetadata();
  private readonly onTimeUpdate = () => {
    const a = this.audioEl;
    const now = Date.now();
    if (now - this.lastTimeNotify < 200) return;
    this.lastTimeNotify = now;
    this.partial(() => ({ currentTime: a.currentTime, duration: a.duration || this.state.duration }));
  };
  private readonly onEnded = () => this.handleEnded();
  private readonly onPlay = () => this.partial(() => ({ status: "playing", error: null }));
  private readonly onPause = () => this.partial(() => ({ status: "paused" }));
  private readonly onError = () => this.handleMediaError();
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private queue: string[] = [];
  private currentIndex = -1;
  private pendingRequestId = 0;
  private state: PlaybackState = { ...initialState };
  private subscribers = new Set<(state: PlaybackState) => void>();
  private lastTimeNotify = 0;
  private listenersBound = false;

  constructor(options: PlaybackControllerOptions = {}) {
    this.audioFactory = options.audioFactory ?? (() => new Audio());
  }

  private get audioEl(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = this.audioFactory();
      this.bindListeners();
    }
    return this.audio;
  }

  private setState(next: PlaybackState): void {
    const changed =
      next.currentTrackId !== this.state.currentTrackId ||
      next.status !== this.state.status ||
      next.currentTime !== this.state.currentTime ||
      next.duration !== this.state.duration ||
      next.volume !== this.state.volume ||
      next.muted !== this.state.muted ||
      next.error !== this.state.error;
    this.state = next;
    if (changed) {
      const snapshot = this.state;
      this.subscribers.forEach((cb) => cb(snapshot));
    }
  }

  private partial(updater: (prev: PlaybackState) => Partial<PlaybackState>): void {
    this.setState({ ...this.state, ...updater(this.state) });
  }

  private notify(): void {
    const snapshot = this.state;
    this.subscribers.forEach((cb) => cb(snapshot));
  }

  subscribe(callback: (state: PlaybackState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getState(): PlaybackState {
    return this.state;
  }

  private bindListeners(): void {
    if (this.listenersBound) return;
    const a = this.audioEl;
    a.addEventListener("loadedmetadata", this.onLoadedMetadata);
    a.addEventListener("timeupdate", this.onTimeUpdate);
    a.addEventListener("ended", this.onEnded);
    a.addEventListener("play", this.onPlay);
    a.addEventListener("pause", this.onPause);
    a.addEventListener("error", this.onError);
    this.listenersBound = true;
  }

  private handleLoadedMetadata(): void {
    const a = this.audioEl;
    this.partial(() => ({
      duration: a.duration || 0,
      currentTime: a.currentTime,
    }));
  }

  private handleEnded(): void {
    this.playNext();
  }

  private handleMediaError(): void {
    const a = this.audioEl;
    const err = a.error;
    let message = "Media error";
    if (err) {
      switch (err.code) {
        case 1:
          message = "Media download aborted";
          break;
        case 2:
          message = "Media download failed";
          break;
        case 3:
          message = "Media decoding failed";
          break;
        case 4:
          message = "Media source not supported";
          break;
        default:
          message = `Media error (code ${err.code})`;
      }
    }
    this.setState({ ...this.state, status: "idle", error: message, currentTrackId: null });
    this.currentIndex = -1;
    this.revokeCurrentUrl();
  }

  private revokeCurrentUrl(): void {
    if (this.currentUrl) {
      try {
        URL.revokeObjectURL(this.currentUrl);
      } catch {
        // ignore revoke failures
      }
      this.currentUrl = null;
    }
  }

  private async loadAndPlay(trackId: string, requestId: number): Promise<void> {
    let track: Track | undefined;
    try {
      track = await libraryStorage.getTrack(trackId);
    } catch {
      // fall through, track stays undefined
    }

    this.throwIfStale(requestId);
    if (!track) {
      this.fail(requestId, "Track not found");
      return;
    }
    if (!track.available) {
      this.fail(requestId, "Track is unavailable for playback");
      return;
    }

    let arrayBuffer: ArrayBuffer | undefined;
    try {
      arrayBuffer = await audioStorage.getAudio(trackId);
    } catch {
      arrayBuffer = undefined;
    }

    this.throwIfStale(requestId);
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      this.fail(requestId, "Audio data not found for this track");
      return;
    }

    if (track.mimeType && !this.audioEl.canPlayType(track.mimeType)) {
      this.fail(requestId, `Unsupported media format: ${track.mimeType}`);
      return;
    }

    let blob: Blob;
    try {
      blob = new Blob([arrayBuffer], { type: track.mimeType || undefined });
    } catch {
      this.fail(requestId, "Unable to create audio data for this track");
      return;
    }

    this.throwIfStale(requestId);
    this.revokeCurrentUrl();
    const url = URL.createObjectURL(blob);
    this.currentUrl = url;

    this.setState({
      ...this.state,
      currentTrackId: trackId,
      status: "loading",
      error: null,
      duration: 0,
      currentTime: 0,
    });

    this.currentIndex = this.queue.indexOf(trackId);
    if (this.currentIndex === -1) {
      this.currentIndex = this.queue.push(trackId) - 1;
    }

    const a = this.audioEl;
    a.volume = this.state.volume;
    a.muted = this.state.muted;

    try {
      a.src = url;
      await a.play();
    } catch (e) {
      this.throwIfStale(requestId);
      this.fail(requestId, `Playback failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    this.throwIfStale(requestId);
    this.partial(() => ({
      status: "playing",
      error: null,
      duration: this.audioEl.duration || 0,
      currentTime: this.audioEl.currentTime,
    }));
  }

  private throwIfStale(requestId: number): void {
    if (requestId !== this.pendingRequestId) {
      throw new Error("stale playback request");
    }
  }

  private fail(requestId: number, message: string): void {
    this.throwIfStale(requestId);
    this.setState({
      ...this.state,
      status: "idle",
      error: message,
      currentTrackId: null,
    });
    this.currentIndex = -1;
    this.revokeCurrentUrl();
  }

  async play(trackId: string): Promise<void> {
    if (!trackId) {
      throw new Error("No track id provided");
    }
    const requestId = ++this.pendingRequestId;
    this.partial(() => ({ status: "loading", currentTrackId: trackId, error: null }));
    try {
      await this.loadAndPlay(trackId, requestId);
    } catch (e) {
      if (requestId !== this.pendingRequestId) return;
      if (e instanceof Error && e.message === "stale playback request") return;
      this.fail(requestId, e instanceof Error ? e.message : "Playback failed");
    }
  }

  async pause(): Promise<void> {
    if (!this.audio) return;
    try {
      await this.audio.pause();
    } catch {
      // ignore
    }
    this.partial(() => ({ status: "paused" }));
  }

  async resume(): Promise<void> {
    if (this.state.status === "paused" && this.state.currentTrackId && this.audio) {
      try {
        await this.audio.play();
        this.partial(() => ({ status: "playing", error: null }));
      } catch (e) {
        this.setState({ ...this.state, status: "idle", error: `Resume failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    } else if (this.state.status === "idle" && this.state.currentTrackId) {
      await this.play(this.state.currentTrackId);
    }
  }

  async seek(seconds: number): Promise<void> {
    if (!this.audio) return;
    const value = Math.max(0, Math.min(seconds, this.state.duration || 0));
    const a = this.audio;
    if (a.readyState >= 1) {
      a.currentTime = value;
    } else {
      const once = () => {
        a.currentTime = value;
        a.removeEventListener("loadedmetadata", once);
      };
      a.addEventListener("loadedmetadata", once, { once: true });
    }
    this.partial(() => ({ currentTime: value }));
  }

  async setVolume(value: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, value));
    this.partial(() => ({ volume: clamped, muted: false }));
    if (this.audio) this.audio.volume = clamped;
  }

  async setMuted(muted: boolean): Promise<void> {
    this.partial(() => ({ muted }));
    if (this.audio) this.audio.muted = muted;
  }

  async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.stop();
      return;
    }
    const nextIndex = this.currentIndex + 1;
    if (nextIndex < this.queue.length) {
      await this.play(this.queue[nextIndex]);
    } else {
      this.stop();
    }
  }

  async playPrevious(): Promise<void> {
    if (this.queue.length === 0) {
      this.stop();
      return;
    }
    const prevIndex = this.currentIndex - 1;
    if (prevIndex >= 0) {
      await this.play(this.queue[prevIndex]);
    } else {
      await this.play(this.queue[0]);
    }
  }

  setQueue(trackIds: string[]): void {
    this.queue = [...trackIds];
    if (this.state.currentTrackId && this.queue.includes(this.state.currentTrackId)) {
      this.currentIndex = this.queue.indexOf(this.state.currentTrackId);
    } else {
      this.currentIndex = -1;
    }
    this.partial(() => ({ queue: this.queue }));
  }

  async stop(): Promise<void> {
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        // ignore
      }
      try {
        this.audio.src = "";
      } catch {
        // ignore
      }
    }
    this.revokeCurrentUrl();
    this.currentIndex = -1;
    this.currentUrl = null;
    this.setState({ ...initialState, volume: this.state.volume, muted: this.state.muted, queue: this.queue });
  }

  destroy(): void {
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        // ignore
      }
    }
    this.revokeCurrentUrl();
    if (this.audio && this.listenersBound) {
      this.audio.removeEventListener("loadedmetadata", this.onLoadedMetadata);
      this.audio.removeEventListener("timeupdate", this.onTimeUpdate);
      this.audio.removeEventListener("ended", this.onEnded);
      this.audio.removeEventListener("play", this.onPlay);
      this.audio.removeEventListener("pause", this.onPause);
      this.audio.removeEventListener("error", this.onError);
      this.listenersBound = false;
    }
    this.audio = null;
    this.subscribers.clear();
    this.state = { ...initialState };
    this.notify();
  }
}
