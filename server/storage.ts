/*
 * © 2025 Full Digital LLC. All Rights Reserved.
 * CUTMV - Music Video Cut-Down Tool
 * Proprietary software - unauthorized use prohibited
 */

import { videos, clips, type Video, type InsertVideo, type Clip, type InsertClip } from "@shared/schema";

export interface IStorage {
  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: number): Promise<Video | undefined>;
  updateVideo(id: number, updates: Partial<Video>): Promise<Video | undefined>;
  deleteVideo(id: number): Promise<boolean>;
  
  // Clip operations
  createClip(clip: InsertClip): Promise<Clip>;
  getClipsByVideoId(videoId: number): Promise<Clip[]>;
  updateClip(id: number, updates: Partial<Clip>): Promise<Clip | undefined>;
  deleteClip(id: number): Promise<boolean>;
  deleteClipsByVideoId(videoId: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private videos: Map<number, Video>;
  private clips: Map<number, Clip>;
  private currentVideoId: number;
  private currentClipId: number;

  constructor() {
    this.videos = new Map();
    this.clips = new Map();
    this.currentVideoId = 1;
    this.currentClipId = 1;
  }

  // Video operations
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = this.currentVideoId++;
    const video: Video = { ...insertVideo, id, processed: false };
    this.videos.set(id, video);
    return video;
  }

  async getVideo(id: number): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async updateVideo(id: number, updates: Partial<Video>): Promise<Video | undefined> {
    const video = this.videos.get(id);
    if (!video) return undefined;
    
    const updatedVideo = { ...video, ...updates };
    this.videos.set(id, updatedVideo);
    return updatedVideo;
  }

  async deleteVideo(id: number): Promise<boolean> {
    return this.videos.delete(id);
  }

  // Clip operations
  async createClip(insertClip: InsertClip): Promise<Clip> {
    const id = this.currentClipId++;
    const clip: Clip = { ...insertClip, id, processed: false };
    this.clips.set(id, clip);
    return clip;
  }

  async getClipsByVideoId(videoId: number): Promise<Clip[]> {
    return Array.from(this.clips.values()).filter(clip => clip.videoId === videoId);
  }

  async updateClip(id: number, updates: Partial<Clip>): Promise<Clip | undefined> {
    const clip = this.clips.get(id);
    if (!clip) return undefined;
    
    const updatedClip = { ...clip, ...updates };
    this.clips.set(id, updatedClip);
    return updatedClip;
  }

  async deleteClip(id: number): Promise<boolean> {
    return this.clips.delete(id);
  }

  async deleteClipsByVideoId(videoId: number): Promise<boolean> {
    const clipsToDelete = Array.from(this.clips.entries())
      .filter(([_, clip]) => clip.videoId === videoId)
      .map(([id, _]) => id);
    
    clipsToDelete.forEach(id => this.clips.delete(id));
    return true;
  }
}

export const storage = new MemStorage();
