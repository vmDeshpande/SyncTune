import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PlaybackController } from "../lib/playback";
import type { PlaybackState } from "../lib/playback";

type PlaybackContextValue = { controller: PlaybackController } | null;

const PlaybackContext = createContext<PlaybackContextValue>(null);

export const playbackController = new PlaybackController();

export function PlaybackProvider({ children }: { children: ReactNode }) {
  return <PlaybackContext.Provider value={{ controller: playbackController }}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }
  const { controller } = ctx;
  const [state, setState] = useState<PlaybackState>(controller.getState());

  useEffect(() => {
    const unsubscribe = controller.subscribe((next) => setState(next));
    return unsubscribe;
  }, [controller]);

  const play = (trackId: string) => controller.play(trackId);
  const pause = () => controller.pause();
  const resume = () => controller.resume();
  const seek = (seconds: number) => controller.seek(seconds);
  const setVolume = (value: number) => controller.setVolume(value);
  const setMuted = (muted: boolean) => controller.setMuted(muted);
  const playNext = () => controller.playNext();
  const playPrevious = () => controller.playPrevious();
  const stop = () => controller.stop();
  const setQueue = (trackIds: string[]) => controller.setQueue(trackIds);

  return {
    state,
    play,
    pause,
    resume,
    seek,
    setVolume,
    setMuted,
    playNext,
    playPrevious,
    stop,
    setQueue,
  };
}
