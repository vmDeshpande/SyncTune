import { z } from "zod";

export const SourceTypeSchema = z.enum([
  "browser-file",
  "desktop-file",
  "spotify-metadata",
  "authorized-source",
]);

export const TrackSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  durationMs: z.number().nullable(),
  trackNumber: z.number().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number(),
  artworkRef: z.string().nullable(),
  sourceType: SourceTypeSchema,
  importedAt: z.string(),
  fingerprint: z.string().nullable(),
  available: z.boolean(),
  metadataStatus: z.enum(["complete", "partial", "failed"]),
});

export type Track = z.infer<typeof TrackSchema>;

export const PlaylistSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  trackIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceMetadata: z.record(z.string(), z.unknown()).nullable(),
});

export type Playlist = z.infer<typeof PlaylistSchema>;
