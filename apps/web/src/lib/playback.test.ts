import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackController } from "./playback";

const track = (id: string, overrides: Partial<{ mimeType: string | null; available: boolean; durationMs: number | null }> = {}) => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  album: `Album ${id}`,
  durationMs: overrides.durationMs ?? 120000,
  trackNumber: null,
  mimeType: overrides.mimeType ?? "audio/mpeg",
  fileSize: 1000,
  artworkRef: null,
  sourceType: "browser-file" as const,
  importedAt: new Date().toISOString(),
  fingerprint: null,
  available: overrides.available ?? true,
  metadataStatus: "complete" as const,
});

const buffer = () => new ArrayBuffer(16);

type MockAudio = {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  readyState: number;
  error: MediaError | null;
  canPlayType: (type: string) => string;
  playImpl: ReturnType<typeof vi.fn>;
  pauseImpl: ReturnType<typeof vi.fn>;
  listeners: Map<string, Array<(ev: Event) => void>>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  addEventListener: (type: string, listener: (ev: Event) => void) => void;
  removeEventListener: (type: string, listener: (ev: Event) => void) => void;
};

function createMockAudio(): MockAudio {
  const listeners = new Map<string, Array<(ev: Event) => void>>();
  const audio: any = {
    src: "",
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    readyState: 4,
    error: null,
    canPlayType: () => "probably",
    playImpl: vi.fn(async () => {}),
    pauseImpl: vi.fn(async () => {}),
    addEventListener: vi.fn((type: string, listener: (ev: Event) => void) => {
      const arr = listeners.get(type) ?? [];
      arr.push(listener);
      listeners.set(type, arr);
    }),
    removeEventListener: vi.fn((type: string, listener: (ev: Event) => void) => {
      const arr = listeners.get(type);
      if (arr) {
        const i = arr.indexOf(listener);
        if (i >= 0) arr.splice(i, 1);
      }
    }),
    play: vi.fn(function (this: any) {
      return audio.playImpl();
    }),
    pause: vi.fn(function (this: any) {
      return audio.pauseImpl();
    }),
    listeners,
  };
  return audio;
}

function trigger(audio: MockAudio, type: string) {
  audio.listeners.get(type)?.forEach((listener) => listener({ type } as Event));
}

let urlCounter = 0;
const createObjectURL = vi.fn(() => `blob:mock-url-${++urlCounter}`);
const revokeObjectURL = vi.fn();

vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

vi.mock("../lib/storage", () => ({
  libraryStorage: {
    getTrack: vi.fn(),
  },
  audioStorage: {
    getAudio: vi.fn(),
    saveAudio: vi.fn(),
    removeAudio: vi.fn(),
    audioExists: vi.fn(),
  },
}));

import { libraryStorage, audioStorage } from "../lib/storage";

beforeEach(() => {
  urlCounter = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
  (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(buffer());
});

function createController(audio?: MockAudio) {
  const el = audio ?? createMockAudio();
  return { controller: new PlaybackController({ audioFactory: () => el as unknown as HTMLAudioElement }), audio: el };
}

async function playTrack(controller: PlaybackController, trackId: string, audio: MockAudio) {
  (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track(trackId));
  (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(buffer());
  audio.duration = 100;
  trigger(audio, "loadedmetadata");
  await controller.play(trackId);
}

describe("PlaybackController", () => {
  it("exposes an initial idle state", () => {
    const { controller } = createController();
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.currentTrackId).toBeNull();
    expect(s.queue).toEqual([]);
    expect(s.error).toBeNull();
    expect(s.volume).toBe(1);
    expect(s.muted).toBe(false);
  });

  it("setQueue updates queue and current index", () => {
    const { controller } = createController();
    controller.setQueue(["a", "b", "c"]);
    expect(controller.getState().queue).toEqual(["a", "b", "c"]);
  });

  it("playNext advances through the queue and stops at the end", async () => {
    const { controller, audio } = createController();
    controller.setQueue(["a", "b", "c"]);
    await playTrack(controller, "a", audio);
    expect(controller.getState().currentTrackId).toBe("a");

    await controller.playNext();
    expect(controller.getState().currentTrackId).toBe("b");

    await controller.playNext();
    expect(controller.getState().currentTrackId).toBe("c");

    await controller.playNext();
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.currentTrackId).toBeNull();
  });

  it("playPrevious goes to the previous track", async () => {
    const { controller, audio } = createController();
    controller.setQueue(["a", "b", "c"]);
    await playTrack(controller, "b", audio);
    await controller.playPrevious();
    expect(controller.getState().currentTrackId).toBe("a");
  });

  it("playNext on an empty queue stops", async () => {
    const { controller } = createController();
    controller.setQueue([]);
    await controller.playNext();
    expect(controller.getState().status).toBe("idle");
  });

  it("play selects a track and transitions to playing", async () => {
    const { controller, audio } = createController();
    await playTrack(controller, "t1", audio);
    const s = controller.getState();
    expect(s.currentTrackId).toBe("t1");
    expect(s.status).toBe("playing");
    expect(s.error).toBeNull();
    expect(s.duration).toBe(100);
  });

  it("pause and resume transition status", async () => {
    const { controller, audio } = createController();
    await playTrack(controller, "t1", audio);
    await controller.pause();
    expect(controller.getState().status).toBe("paused");
    await controller.resume();
    expect(controller.getState().status).toBe("playing");
  });

  it("seek clamps to valid range and updates currentTime", async () => {
    const { controller, audio } = createController();
    await playTrack(controller, "t1", audio);
    await controller.seek(30);
    expect(controller.getState().currentTime).toBe(30);
    expect(audio.currentTime).toBe(30);
    await controller.seek(-5);
    expect(controller.getState().currentTime).toBe(0);
    await controller.seek(999);
    expect(controller.getState().currentTime).toBe(100);
  });

  it("setVolume clamps to [0, 1]", async () => {
    const { controller, audio } = createController();
    await playTrack(controller, "t1", audio);
    await controller.setVolume(1.5);
    expect(controller.getState().volume).toBe(1);
    expect(audio.volume).toBe(1);
    await controller.setVolume(-0.5);
    expect(controller.getState().volume).toBe(0);
    await controller.setVolume(0.25);
    expect(controller.getState().volume).toBe(0.25);
    expect(audio.volume).toBe(0.25);
  });

  it("setMuted toggles muted state", async () => {
    const { controller, audio } = createController();
    await playTrack(controller, "t1", audio);
    await controller.setMuted(true);
    expect(controller.getState().muted).toBe(true);
    expect(audio.muted).toBe(true);
    await controller.setMuted(false);
    expect(controller.getState().muted).toBe(false);
    expect(audio.muted).toBe(false);
  });

  it("updates currentTime from timeupdate events", async () => {
    const { controller, audio } = createController();
    await playTrack(controller, "t1", audio);
    audio.currentTime = 12.5;
    trigger(audio, "timeupdate");
    expect(controller.getState().currentTime).toBe(12.5);
  });

  it("handles missing audio data", async () => {
    const { controller } = createController();
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("no-audio"));
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    await controller.play("no-audio");
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.currentTrackId).toBeNull();
    expect(s.error).toBe("Audio data not found for this track");
  });

  it("handles track not found", async () => {
    const { controller } = createController();
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    await controller.play("missing");
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.error).toBe("Track not found");
  });

  it("handles unavailable tracks", async () => {
    const { controller } = createController();
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("unavail", { available: false }));
    await controller.play("unavail");
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.error).toBe("Track is unavailable for playback");
  });

  it("reports unsupported media format", async () => {
    const { controller, audio } = createController();
    audio.canPlayType = () => "";
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("bad", { mimeType: "audio/ogg" }));
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(buffer());
    await controller.play("bad");
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.error).toContain("Unsupported media format");
  });

  it("handles playback rejection", async () => {
    const { controller, audio } = createController();
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("err"));
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(buffer());
    audio.playImpl.mockRejectedValue(new Error("aborted"));
    await controller.play("err");
    const s = controller.getState();
    expect(s.status).toBe("idle");
    expect(s.error).toContain("aborted");
  });

  it("advances the queue on track completion (ended)", async () => {
    const { controller, audio } = createController();
    controller.setQueue(["a", "b"]);
    await playTrack(controller, "a", audio);
    expect(controller.getState().currentTrackId).toBe("a");
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("b"));
    trigger(audio, "ended");
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getState().currentTrackId).toBe("b");
  });

  it("does not let a stale async request override the current track", async () => {
    const { controller } = createController();
    let resolveAudio!: (value: ArrayBuffer) => void;
    const audioDeferred = new Promise<ArrayBuffer>((resolve) => {
      resolveAudio = resolve;
    });
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("a"));
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(audioDeferred);
    const playA = controller.play("a");
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockReturnValue(track("b"));
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockReturnValue(buffer());
    await controller.play("b");
    expect(controller.getState().currentTrackId).toBe("b");
    resolveAudio(buffer());
    await playA;
    expect(controller.getState().currentTrackId).toBe("b");
  });
});
