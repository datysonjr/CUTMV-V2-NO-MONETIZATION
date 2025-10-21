/*
 * © 2025 Full Digital LLC. All Rights Reserved.
 * CUTMV - Music Video Cut-Down Tool
 * Proprietary software - unauthorized use prohibited
 */

import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  path: text("path").notNull(),
  size: integer("size").notNull(),
  duration: text("duration"),
  processed: boolean("processed").default(false),
});

export const clips = pgTable("clips", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => videos.id),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  filename: text("filename").notNull(),
  path: text("path"),
  processed: boolean("processed").default(false),
});

export const insertVideoSchema = createInsertSchema(videos).pick({
  filename: true,
  originalName: true,
  path: true,
  size: true,
  duration: true,
});

export const insertClipSchema = createInsertSchema(clips).pick({
  videoId: true,
  startTime: true,
  endTime: true,
  filename: true,
  path: true,
});

export const timestampSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
});

export const timestampListSchema = z.array(timestampSchema);

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;
export type Clip = typeof clips.$inferSelect;
export type Timestamp = z.infer<typeof timestampSchema>;

export interface ProcessingJob {
  id: number;
  videoId: number;
  isProcessing: boolean;
  progress: number;
  currentClip: number;
  totalClips: number;
  totalGifs: number;
  totalThumbnails: number;
  totalCanvas: number;
  totalOutputs: number;
  estimatedTimeLeft?: number;
  canCancel: boolean;
  downloadUrl?: string;
  error?: string;
  aspectRatios?: ('16:9' | '9:16')[];
}
