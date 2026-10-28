export interface PlaybackAdapter {
  play(): Promise<void>;
  pause(): Promise<void>;
}
