import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "./App";

const mockAudio = {
  src: "",
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  readyState: 4,
  error: null,
  canPlayType: vi.fn(() => "probably"),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(() => Promise.resolve()),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  load: vi.fn(),
};

const track = {
  id: "track-1",
  title: "Neon Afterglow",
  artist: "Kairo Bloom",
  album: "Afterimage",
  durationMs: 218000,
  trackNumber: null,
  mimeType: "audio/mpeg",
  fileSize: 1000,
  artworkRef: null,
  sourceType: "browser-file",
  importedAt: new Date().toISOString(),
  fingerprint: null,
  available: true,
  metadataStatus: "complete" as const,
};

vi.mock("./lib/storage", () => ({
  libraryStorage: {
    listTracks: vi.fn(),
    getTrack: vi.fn(),
    saveTrack: vi.fn(),
    removeTrack: vi.fn(),
    listPlaylists: vi.fn(),
    savePlaylist: vi.fn(),
    removePlaylist: vi.fn(),
  },
  audioStorage: {
    getAudio: vi.fn(),
    saveAudio: vi.fn(),
    removeAudio: vi.fn(),
    audioExists: vi.fn(),
  },
}));

import { libraryStorage, audioStorage } from "./lib/storage";
import { PlaybackProvider, playbackController } from "./hooks/usePlayback";

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mockAudio, {
    src: "",
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    readyState: 4,
    error: null,
  });
  mockAudio.play.mockResolvedValue(undefined);
  mockAudio.pause.mockResolvedValue(undefined);
  mockAudio.canPlayType.mockReturnValue("probably");
  vi.stubGlobal("Audio", vi.fn(() => mockAudio));
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:test-url"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  playbackController.stop();
});

function renderApp(libraryTracks: typeof track[] = []) {
  (libraryStorage.listTracks as ReturnType<typeof vi.fn>).mockResolvedValue(libraryTracks);
  return render(
    <PlaybackProvider>
      <App />
    </PlaybackProvider>,
  );
}

function playerEl() {
  return document.querySelector(".player") as HTMLElement;
}

async function selectTrackViaPlayNow() {
  await waitFor(() => screen.getByText(/play now/i));
  fireEvent.click(screen.getByText(/play now/i));
}

describe("App / Player", () => {
  it("renders without crashing when no tracks are imported", () => {
    renderApp([]);
    expect(playerEl()).toBeInTheDocument();
    const playBtn = screen.getByLabelText(/play/i);
    expect(playBtn).toBeDisabled();
  });

  it("displays the current track metadata after selecting a track", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue(track);
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockResolvedValue(new ArrayBuffer(16));
    mockAudio.duration = 218;

    renderApp([track]);
    await selectTrackViaPlayNow();

    const player = within(playerEl());
    await waitFor(() => expect(player.getByText("Neon Afterglow")).toBeInTheDocument());
    expect(player.getByText("Kairo Bloom")).toBeInTheDocument();
  });

  it("toggles play and pause", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue(track);
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockResolvedValue(new ArrayBuffer(16));
    mockAudio.duration = 218;

    renderApp([track]);
    await selectTrackViaPlayNow();
    await waitFor(() => within(playerEl()).getByText("Neon Afterglow"));

    const pauseBtn = screen.getByLabelText(/pause/i);
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);
    await waitFor(() => screen.getByLabelText(/play/i));
  });

  it("seek slider calls the controller and updates audio currentTime", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue(track);
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockResolvedValue(new ArrayBuffer(16));
    mockAudio.duration = 218;

    renderApp([track]);
    await selectTrackViaPlayNow();
    await waitFor(() => within(playerEl()).getByText("Neon Afterglow"));

    const seekInput = screen.getByLabelText(/seek/i) as HTMLInputElement;
    fireEvent.change(seekInput, { target: { value: 30 } });
    expect(mockAudio.currentTime).toBe(30);
  });

  it("volume slider calls setVolume on the audio element", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue(track);
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockResolvedValue(new ArrayBuffer(16));
    mockAudio.duration = 218;

    renderApp([track]);
    await selectTrackViaPlayNow();
    await waitFor(() => within(playerEl()).getByText("Neon Afterglow"));

    const volumeInput = screen.getByLabelText(/volume/i) as HTMLInputElement;
    fireEvent.change(volumeInput, { target: { value: 0.5 } });
    expect(mockAudio.volume).toBe(0.5);
  });

  it("mute toggle calls setMuted on the audio element", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue(track);
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockResolvedValue(new ArrayBuffer(16));
    mockAudio.duration = 218;

    renderApp([track]);
    await selectTrackViaPlayNow();
    await waitFor(() => within(playerEl()).getByText("Neon Afterglow"));

    const muteBtn = screen.getByLabelText(/mute/i);
    fireEvent.click(muteBtn);
    expect(mockAudio.muted).toBe(true);
  });

  it("shows an error when audio data is missing", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue(track);
    (audioStorage.getAudio as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderApp([track]);
    await selectTrackViaPlayNow();

    await waitFor(() => screen.getByText(/audio data not found/i));
  });

  it("shows an error when the track is unavailable", async () => {
    (libraryStorage.getTrack as ReturnType<typeof vi.fn>).mockResolvedValue({ ...track, available: false });

    renderApp([track]);
    await selectTrackViaPlayNow();

    await waitFor(() => screen.getByText(/unavailable for playback/i));
  });
});
