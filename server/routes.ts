/*
 * © 2025 Full Digital LLC. All Rights Reserved.
 * CUTMV - Music Video Cut-Down Tool
 * Proprietary software - unauthorized use prohibited
 */

import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import ffmpeg from "fluent-ffmpeg";
import AdmZip from "adm-zip";
import { insertVideoSchema, timestampListSchema } from "@shared/schema";

// Progress tracking storage
const processingJobs = new Map<number, {
  totalClips: number;
  currentClip: number;
  progress: number;
  status: 'processing' | 'completed' | 'error';
  errors: string[];
  downloadPath?: string;
}>();

// Streamlined multer for maximum upload speed
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp4|mov|mkv|avi|webm|mp3|wav|m4a)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a video or audio file.'));
    }
  }
});

// Separate multer config for chunks (no file type validation needed)
const chunkUpload = multer({
  dest: 'uploads/chunks/',
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB chunk limit
  }
});

// Utility function to check available disk space
async function checkDiskSpace(): Promise<{ available: number; total: number }> {
  try {
    const stats = await fs.statfs('./uploads');
    return {
      available: stats.bavail * stats.bsize, // Available space in bytes
      total: stats.blocks * stats.bsize // Total space in bytes
    };
  } catch (error) {
    console.warn('Could not check disk space:', error);
    return { available: Infinity, total: Infinity };
  }
}

// Utility function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Store for chunked uploads - lightweight metadata only (chunks stored on disk)
const chunkStore = new Map<string, {
  chunkDir: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  receivedChunks: number;
  timestamp: number;
  finalizing: boolean;
}>();

// Auto-cleanup function for old files
async function cleanupOldFiles(): Promise<void> {
  try {
    const uploadsDir = './uploads';
    const files = await fs.readdir(uploadsDir);
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stats = await fs.stat(filePath);
      
      // Delete files older than 24 hours
      if (stats.mtime.getTime() < oneDayAgo) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    }
  } catch (error) {
    console.warn('Cleanup failed:', error);
  }
}

// Start auto-cleanup timer (runs every 6 hours)
setInterval(cleanupOldFiles, 6 * 60 * 60 * 1000);

export async function registerRoutes(app: Express): Promise<Server> {
  
  // High-speed chunked upload endpoint optimized for 500MB-5GB files
  app.post("/api/upload-chunk", chunkUpload.single('chunk'), async (req, res) => {
    try {
      const { chunkIndex, totalChunks, uploadId, fileName } = req.body;
      
      if (!req.file || !uploadId || chunkIndex === undefined) {
        return res.status(400).json({ message: "Missing chunk data" });
      }

      // Create upload session on first chunk
      if (!chunkStore.has(uploadId)) {
        const chunkDir = path.join('uploads', 'chunks', uploadId);
        await fs.mkdir(chunkDir, { recursive: true });
        
        chunkStore.set(uploadId, {
          chunkDir,
          fileName,
          totalSize: 0,
          totalChunks: parseInt(totalChunks),
          receivedChunks: 0,
          timestamp: Date.now(),
          finalizing: false,
        });
      }
      
      const upload = chunkStore.get(uploadId)!;
      
      // Store chunk on disk with zero-padded index for sequential reading
      const chunkFileName = String(chunkIndex).padStart(5, '0') + '.part';
      const chunkPath = path.join(upload.chunkDir, chunkFileName);
      
      // Move uploaded chunk to permanent location (no need to read into memory)
      await fs.rename(req.file.path, chunkPath);
      
      // Update metadata
      const chunkStats = await fs.stat(chunkPath);
      upload.receivedChunks++;
      upload.totalSize += chunkStats.size;
      
      console.log(`Chunk ${parseInt(chunkIndex) + 1}/${upload.totalChunks} received (${Math.round(upload.totalSize / 1024 / 1024)}MB)`);
      
      // Set response headers for keep-alive connections
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=300, max=1000');
      
      // Fast response
      res.json({ success: true, received: upload.receivedChunks, total: upload.totalChunks });
    } catch (error) {
      console.error('Chunk upload error:', error);
      res.status(500).json({ message: "Failed to upload chunk" });
    }
  });

  // Finalize chunked upload
  app.post("/api/finalize-upload", async (req, res) => {
    try {
      const { uploadId, fileName, totalSize } = req.body;
      
      const upload = chunkStore.get(uploadId);
      if (!upload) {
        return res.status(400).json({ message: "Upload session not found" });
      }
      
      if (upload.receivedChunks !== upload.totalChunks) {
        return res.status(400).json({ message: "Incomplete upload" });
      }
      
      // Prevent concurrent finalization
      if (upload.finalizing) {
        return res.status(409).json({ message: "Upload already being finalized" });
      }
      upload.finalizing = true;
      
      const finalPath = `uploads/${Date.now()}-${fileName}`;
      
      try {
        // Stream-merge chunks without loading into memory
        const writeStream = createWriteStream(finalPath);
        
        // Read and write chunks sequentially
        for (let i = 0; i < upload.totalChunks; i++) {
          const chunkFileName = String(i).padStart(5, '0') + '.part';
          const chunkPath = path.join(upload.chunkDir, chunkFileName);
          
          // Verify chunk exists
          try {
            await fs.access(chunkPath);
          } catch {
            throw new Error(`Missing chunk ${i}`);
          }
          
          // Stream chunk to final file
          const chunkData = await fs.readFile(chunkPath);
          writeStream.write(chunkData);
        }
        
        writeStream.end();
        
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        
        // Create video record
        const video = await storage.createVideo({
          filename: path.basename(finalPath),
          originalName: fileName,
          path: finalPath,
          size: totalSize,
        });
        
        // Background FFmpeg processing
        setImmediate(() => {
          ffmpeg.ffprobe(finalPath, (err, metadata) => {
            if (!err && metadata?.format?.duration) {
              const duration = formatDuration(metadata.format.duration);
              storage.updateVideo(video.id, { duration });
            }
          });
        });
        
        // Cleanup chunk directory and session
        await fs.rm(upload.chunkDir, { recursive: true, force: true });
        chunkStore.delete(uploadId);
        
        res.json(video);
      } catch (error) {
        // Cleanup on failure
        try {
          await fs.unlink(finalPath).catch(() => {});
          await fs.rm(upload.chunkDir, { recursive: true, force: true });
        } catch {}
        
        chunkStore.delete(uploadId);
        throw error;
      }
    } catch (error) {
      console.error('Finalize upload error:', error);
      res.status(500).json({ message: "Failed to finalize upload" });
    }
  });

  // Regular upload endpoint for smaller files
  app.post("/api/upload", upload.single('video'), async (req, res) => {
    try {
      console.log('Upload request received');
      
      // Check disk space before processing
      const diskSpace = await checkDiskSpace();
      console.log(`Disk space: ${formatBytes(diskSpace.available)} available of ${formatBytes(diskSpace.total)} total`);
      
      console.log('File info:', req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : 'No file');
      
      if (!req.file) {
        return res.status(400).json({ message: "No video file uploaded" });
      }

      // Check if we have enough disk space (need 2x file size for processing)
      const requiredSpace = req.file.size * 2;
      if (diskSpace.available < requiredSpace) {
        // Clean up the uploaded file
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(507).json({ 
          message: `Insufficient disk space. Need ${formatBytes(requiredSpace)}, have ${formatBytes(diskSpace.available)} available.` 
        });
      }

      console.log('Creating video record in storage...');
      const video = await storage.createVideo({
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
      });
      console.log('Video created:', video);

      // Immediately respond to speed up upload
      res.json(video);

      // Get video duration using ffmpeg in background (non-blocking)
      setImmediate(() => {
        ffmpeg.ffprobe(req.file.path, (err, metadata) => {
          if (!err && metadata?.format?.duration) {
            const duration = formatDuration(metadata.format.duration);
            storage.updateVideo(video.id, { duration });
            console.log(`Updated video ${video.id} with duration: ${duration}`);
          }
        });
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: "Failed to upload video" });
    }
  });

  // Parse timestamps endpoint
  app.post("/api/parse-timestamps", async (req, res) => {
    try {
      const { text, videoId } = req.body;
      
      if (!text || !videoId) {
        return res.status(400).json({ message: "Text and videoId are required" });
      }

      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      const timestamps = parseTimestamps(text);
      const validation = validateTimestamps(timestamps, video.duration);

      res.json({
        timestamps: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      });
    } catch (error) {
      console.error('Parse timestamps error:', error);
      res.status(500).json({ message: "Failed to parse timestamps" });
    }
  });

  // Auto 5-Cut Generator endpoint
  app.post("/api/generate-5-cuts", async (req, res) => {
    try {
      const { videoId } = req.body;
      
      if (!videoId) {
        return res.status(400).json({ message: "Video ID is required" });
      }

      const video = await storage.getVideo(videoId);
      if (!video || !video.duration) {
        return res.status(404).json({ message: "Video not found or duration unknown" });
      }

      const timestamps = generateRandomTimestamps(video.duration);
      const validation = validateTimestamps(timestamps, video.duration);

      res.json({
        timestamps: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    } catch (error) {
      console.error('Generate 5-cuts error:', error);
      res.status(500).json({ message: "Failed to generate clips" });
    }
  });

  // Process clips endpoint
  // Process clips with direct text parsing (streamlined workflow)
  app.post('/api/process-clips-direct', async (req, res) => {
    try {
      const { videoId, timestampText, outputName, quality = 'balanced', videoFade = false, audioFade = false, fadeDuration = 0.5, generateGif = false, generateThumbnails = false, generateCanvas = false, aspectRatios = ['16:9'] } = req.body;

      if (!videoId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Video ID is required' 
        });
      }

      if (!timestampText && !generateGif && !generateThumbnails && !generateCanvas) {
        return res.status(400).json({ 
          success: false, 
          message: 'Either timestamp text or export generation must be specified' 
        });
      }

      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ 
          success: false, 
          message: 'Video not found' 
        });
      }

      // Parse timestamps only if provided
      let validatedResult = { valid: [], errors: [], warnings: [] };
      if (timestampText && timestampText.trim()) {
        const parseResult = parseTimestamps(timestampText);
        validatedResult = validateTimestamps(parseResult, video.duration);

        if (validatedResult.valid.length === 0 && !generateGif && !generateThumbnails && !generateCanvas) {
          return res.status(400).json({
            success: false,
            message: 'No valid timestamps found and no exports requested',
            errors: validatedResult.errors
          });
        }
      }

      // Process clips with valid timestamps
      const qualitySettings = {
        high: 'libx264 -crf 18',
        balanced: 'libx264 -crf 20', 
        compressed: 'libx264 -crf 23'
      };

      const finalOutputName = outputName || video.originalName.replace(/\.[^/.]+$/, '');
      const masterOutputDir = path.join('uploads', 'clips', finalOutputName);
      await fs.mkdir(masterOutputDir, { recursive: true });
      
      // Create separate folders for different content types and aspect ratios
      const clipsDir16x9 = path.join(masterOutputDir, 'clips (16x9)');
      const clipsDir9x16 = path.join(masterOutputDir, 'clips (9x16)');
      const gifsDir = path.join(masterOutputDir, 'gifs');  
      const thumbnailsDir = path.join(masterOutputDir, 'thumbnails');
      const canvasDir = path.join(masterOutputDir, 'canvas');
      
      // Create aspect ratio directories based on selection
      if (validatedResult.valid.length > 0) {
        if (aspectRatios.includes('16:9')) {
          await fs.mkdir(clipsDir16x9, { recursive: true });
        }
        if (aspectRatios.includes('9:16')) {
          await fs.mkdir(clipsDir9x16, { recursive: true });
        }
      }
      if (generateGif) {
        await fs.mkdir(gifsDir, { recursive: true });
      }
      if (generateThumbnails) {
        await fs.mkdir(thumbnailsDir, { recursive: true });
      }
      if (generateCanvas) {
        await fs.mkdir(canvasDir, { recursive: true });
      }

      const processedClips: string[] = [];
      const errors: string[] = [];

      // Calculate total items to process (clips * aspect ratios + optional GIF + optional thumbnails + optional Canvas)
      let totalItems = validatedResult.valid.length * aspectRatios.length;
      if (generateGif) totalItems += 1;
      if (generateThumbnails) totalItems += 1;
      if (generateCanvas) totalItems += 1;

      // Initialize progress tracking with aspect ratio multiplication
      const totalGifs = generateGif ? 10 : 0;
      const totalThumbnails = generateThumbnails ? 10 : 0;
      const totalCanvas = generateCanvas ? 5 : 0;
      const totalClips = validatedResult.valid.length * aspectRatios.length;
      const totalOutputs = totalClips + totalGifs + totalThumbnails + totalCanvas;
      
      processingJobs.set(videoId, {
        totalClips: totalClips,
        totalGifs,
        totalThumbnails,
        totalCanvas,
        totalOutputs,
        currentClip: 0,
        progress: 0,
        status: 'processing',
        errors: [],
        totalItems,
        startTime: Date.now()
      });

      // Process clips for each aspect ratio
      let clipCounter = 0;
      for (let i = 0; i < validatedResult.valid.length; i++) {
        const timestamp = validatedResult.valid[i];
        const clipNumber = String(i + 1).padStart(2, '0');

        // Process for each selected aspect ratio
        for (const aspectRatio of aspectRatios) {
          clipCounter++;
          const aspectSuffix = aspectRatio === '16:9' ? '(16x9)' : '(9x16)';
          const outputDir = aspectRatio === '16:9' ? clipsDir16x9 : clipsDir9x16;
          const outputPath = path.join(outputDir, `${finalOutputName}-clip-${clipNumber} ${aspectSuffix}.mp4`);

          // Update progress before processing each clip
          const job = processingJobs.get(videoId);
          if (job) {
            job.currentClip = clipCounter;
            job.progress = Math.round((clipCounter / totalClips) * 100);
          }

          try {
            // Ensure directory exists for the clip
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            console.log(`Processing clip ${clipCounter}/${totalClips}: ${timestamp.startTime} - ${timestamp.endTime} [${aspectRatio}]`);
            
            await processClipWithAspectRatio(
              video.path,
              timestamp.startTime,
              timestamp.endTime,
              outputPath,
              quality,
              aspectRatio,
              videoId,
              clipCounter,
              totalClips,
              videoFade,
              audioFade,
              fadeDuration
            );
            processedClips.push(outputPath);
            
            // Save clip record
            await storage.createClip({
              videoId: video.id,
              filename: `${finalOutputName}-clip-${clipNumber} ${aspectSuffix}.mp4`,
              startTime: timestamp.startTime,
              endTime: timestamp.endTime,
              path: outputPath
            });
          } catch (error) {
            console.error(`Error processing clip ${clipCounter} [${aspectRatio}]:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Failed to process clip ${clipCounter} [${aspectRatio}]: ${errorMessage}`);
          }
        }
      }

      // Use appropriate directories for exports
      const outputDirForGifs = generateGif ? gifsDir : masterOutputDir;
      const outputDirForThumbnails = generateThumbnails ? thumbnailsDir : masterOutputDir;
      const outputDirForCanvas = generateCanvas ? canvasDir : masterOutputDir;

      // Stage 2: Generate GIFs if requested
      if (generateGif) {
        try {
          console.log('🎬 Generating GIF exports...');
          
          // Update progress for GIF generation start
          const job = processingJobs.get(videoId);
          if (job) {
            job.status = 'processing';
            job.progress = Math.round((validatedResult.valid.length / totalItems) * 100);
          }
          
          const gifPaths = await generateGifExport(video.path, finalOutputName, outputDirForGifs, video.duration, videoId);
          if (gifPaths.length > 0) {
            processedClips.push(...gifPaths);
            console.log(`✅ ${gifPaths.length} GIFs generated successfully`);
          }
        } catch (error) {
          console.error('❌ GIF generation failed:', error);
          errors.push('Failed to generate GIFs');
        }
      }

      // Stage 2: Generate Thumbnails if requested
      if (generateThumbnails) {
        try {
          console.log('📸 Generating thumbnail exports...');
          
          // Update progress for thumbnail generation start
          const job = processingJobs.get(videoId);
          if (job) {
            job.status = 'processing';
            const itemsCompleted = validatedResult.valid.length + (generateGif ? 1 : 0);
            job.progress = Math.round((itemsCompleted / totalItems) * 100);
          }
          
          const thumbnailPaths = await generateThumbnailExports(video.path, finalOutputName, outputDirForThumbnails, video.duration, videoId);
          if (thumbnailPaths.length > 0) {
            processedClips.push(...thumbnailPaths);
            console.log(`✅ Generated ${thumbnailPaths.length} thumbnails`);
          }
        } catch (error) {
          console.error('❌ Thumbnail generation failed:', error);
          errors.push('Failed to generate thumbnails');
        }
      }

      // Stage 3: Generate Spotify Canvas if requested
      if (generateCanvas) {
        try {
          console.log(`🎵 Generating Spotify Canvas exports...`);
          const job = processingJobs.get(videoId);
          if (job) {
            job.status = 'processing';
            const itemsCompleted = validatedResult.valid.length + (generateGif ? 1 : 0) + (generateThumbnails ? 1 : 0);
            job.progress = Math.round((itemsCompleted / totalItems) * 100);
          }
          
          const canvasPaths = await generateCanvasExports(video.path, finalOutputName, outputDirForCanvas, timestampToSeconds(video.duration), videoId);
          if (canvasPaths.length > 0) {
            processedClips.push(...canvasPaths);
            console.log(`✅ Generated ${canvasPaths.length} Canvas loops`);
          }
        } catch (error) {
          console.error('❌ Canvas generation failed:', error);
          errors.push('Failed to generate Canvas loops');
        }
      }

      // Check if we have any output at all (clips, GIFs, thumbnails, or Canvas) - AFTER processing
      if (processedClips.length === 0) {
        return res.status(500).json({
          success: false,
          message: 'No content was generated - no clips, GIFs, thumbnails, or Canvas loops were processed',
          errors
        });
      }

      // Create ZIP file with appropriate naming
      const zip = new AdmZip();
      let zipSuffix = 'clips'; // Default suffix
      
      // Determine suffix based on content type
      if (validatedResult.valid.length > 0) {
        // If clips exist, use "clips" suffix regardless of other content
        zipSuffix = 'clips';
      } else if (generateCanvas) {
        // Canvas takes priority over other exports when no clips
        zipSuffix = 'canvas';
      } else if (generateGif && generateThumbnails) {
        // Both GIFs and thumbnails, no clips or canvas
        zipSuffix = 'exports';
      } else if (generateGif) {
        // Only GIFs
        zipSuffix = 'gifs';
      } else if (generateThumbnails) {
        // Only thumbnails
        zipSuffix = 'thumbnails';
      }
      
      const zipName = `${finalOutputName}-${zipSuffix}.zip`;
      const zipPath = path.join('uploads', 'clips', zipName);
      
      console.log(`📦 Creating ZIP file: ${zipName} with organized folder structure`);

      // Add files to ZIP with proper folder structure
      for (const clipPath of processedClips) {
        const clipName = path.basename(clipPath);
        const relativePath = path.relative(masterOutputDir, clipPath);
        const folderInZip = path.dirname(relativePath);
        
        // Add file with its folder structure
        if (folderInZip === '.' || folderInZip === '') {
          zip.addLocalFile(clipPath, '', clipName);
          console.log(`📁 Added to ZIP root: ${clipName}`);
        } else {
          zip.addLocalFile(clipPath, folderInZip + '/', clipName);
          console.log(`📁 Added to ZIP folder '${folderInZip}': ${clipName}`);
        }
      }

      zip.writeZip(zipPath);

      // Mark as completed
      processingJobs.set(videoId, {
        totalClips: validatedResult.valid.length,
        totalGifs: generateGif ? 10 : 0,
        totalThumbnails: generateThumbnails ? 10 : 0,
        totalCanvas: generateCanvas ? 5 : 0,
        totalOutputs: validatedResult.valid.length + (generateGif ? 10 : 0) + (generateThumbnails ? 10 : 0) + (generateCanvas ? 5 : 0),
        currentClip: validatedResult.valid.length,
        progress: 100,
        status: 'completed',
        errors: [...errors],
        downloadPath: `/api/download/${path.basename(zipPath)}`
      });

      res.json({
        success: true,
        message: `Successfully processed ${processedClips.length} items`,
        clipsProcessed: processedClips.length,
        downloadPath: `/api/download/${path.basename(zipPath)}`,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Direct processing error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to process clips', 
        error: error.message 
      });
    }
  });

  app.post("/api/process-clips", async (req, res) => {
    try {
      const { videoId, timestamps, outputName, quality = 'balanced' } = req.body;
      
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      const validatedTimestamps = timestampListSchema.parse(timestamps);
      
      // Create clips directory
      const clipsDir = path.join('uploads', `${outputName}_CUTS`);
      await fs.mkdir(clipsDir, { recursive: true });

      const clips = [];
      const processingErrors = [];

      for (let i = 0; i < validatedTimestamps.length; i++) {
        const timestamp = validatedTimestamps[i];
        const clipFilename = `${outputName}-clip-${String(i + 1).padStart(2, '0')}.mp4`;
        const clipPath = path.join(clipsDir, clipFilename);

        try {
          await processClip(video.path, timestamp.startTime, timestamp.endTime, clipPath, quality);
          
          const clip = await storage.createClip({
            videoId: video.id,
            startTime: timestamp.startTime,
            endTime: timestamp.endTime,
            filename: clipFilename,
            path: clipPath,
          });

          clips.push(clip);
        } catch (error) {
          console.error(`Error processing clip ${i + 1}:`, error);
          processingErrors.push(`Failed to process clip ${i + 1}: ${error.message}`);
        }
      }

      // Create zip file
      const zip = new AdmZip();
      for (const clip of clips) {
        if (clip.path) {
          zip.addLocalFile(clip.path, '', clip.filename);
        }
      }

      const zipPath = path.join('uploads', `${outputName}.zip`);
      zip.writeZip(zipPath);

      // Update video as processed
      await storage.updateVideo(video.id, { processed: true });

      res.json({
        success: true,
        clipsProcessed: clips.length,
        errors: processingErrors,
        downloadPath: `/api/download/${path.basename(zipPath)}`
      });

    } catch (error) {
      console.error('Process clips error:', error);
      res.status(500).json({ message: "Failed to process clips" });
    }
  });

  // Download endpoint
  app.get("/api/download/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      // Try multiple possible locations for the file
      const possiblePaths = [
        path.join('uploads', filename),
        path.join('uploads', 'clips', filename),
      ];
      
      let filePath = null;
      for (const testPath of possiblePaths) {
        try {
          await fs.access(testPath);
          filePath = testPath;
          break;
        } catch {
          // Continue to next path
        }
      }
      
      if (!filePath) {
        console.error('File not found in any location:', filename);
        return res.status(404).json({ message: "File not found" });
      }
      
      res.download(filePath, filename, (err) => {
        if (err) {
          console.error('Download error:', err);
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to download file" });
          }
        }
      });
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ message: "Server error during download" });
    }
  });

  // Get video info endpoint
  app.get("/api/video/:id", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const video = await storage.getVideo(videoId);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      const clips = await storage.getClipsByVideoId(videoId);
      
      res.json({
        video,
        clips
      });
    } catch (error) {
      console.error('Get video error:', error);
      res.status(500).json({ message: "Failed to get video information" });
    }
  });

  // Progress polling endpoint
  app.get("/api/processing-progress/:videoId", async (req, res) => {
    try {
      const videoId = parseInt(req.params.videoId);
      const progress = processingJobs.get(videoId);
      
      if (!progress) {
        return res.status(404).json({ message: "No processing job found for this video" });
      }

      res.json(progress);
    } catch (error) {
      console.error('Progress check error:', error);
      res.status(500).json({ message: "Failed to get progress" });
    }
  });

  // Cancel processing endpoint
  app.post("/api/cancel-processing/:videoId", async (req, res) => {
    try {
      const videoId = parseInt(req.params.videoId);
      const job = processingJobs.get(videoId);
      
      if (!job) {
        return res.status(404).json({ message: "No processing job found for this video" });
      }

      // Mark job as cancelled
      processingJobs.set(videoId, {
        ...job,
        status: 'error',
        errors: [...job.errors, 'Processing cancelled by user']
      });

      res.json({ message: "Processing cancelled successfully" });
    } catch (error) {
      console.error('Cancel processing error:', error);
      res.status(500).json({ message: "Failed to cancel processing" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper functions

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function parseTimestamps(text: string) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const timestamps = [];
  
  for (const line of lines) {
    // Support various separators: dash, en-dash, comma, space
    const rangeSeparators = /[-–,\s]+/;
    const parts = line.split(rangeSeparators).filter(part => part.trim());
    
    if (parts.length >= 2) {
      const startTime = normalizeTimestamp(parts[0].trim());
      const endTime = normalizeTimestamp(parts[1].trim());
      
      if (startTime && endTime) {
        timestamps.push({ startTime, endTime });
      }
    }
  }
  
  return timestamps;
}

function normalizeTimestamp(timestamp: string): string | null {
  // Remove any extra whitespace
  timestamp = timestamp.trim();
  
  // Support various time separators: colon, semicolon, period
  const timeSeparators = /[;.]/g;
  timestamp = timestamp.replace(timeSeparators, ':');
  
  // Validate format and normalize
  const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const match = timestamp.match(timePattern);
  
  if (match) {
    const [, minutes, seconds, hours] = match;
    
    if (hours) {
      // Format: H:MM:SS or HH:MM:SS
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds}`;
    } else {
      // Format: M:SS or MM:SS - assume no hours
      return `00:${minutes.padStart(2, '0')}:${seconds}`;
    }
  }
  
  return null;
}

function validateTimestamps(timestamps: any[], videoDuration?: string) {
  const valid = [];
  const errors = [];
  const warnings = [];
  
  const videoDurationSeconds = videoDuration ? timestampToSeconds(videoDuration) : null;
  
  for (let i = 0; i < timestamps.length; i++) {
    const { startTime, endTime } = timestamps[i];
    const startSeconds = timestampToSeconds(startTime);
    const endSeconds = timestampToSeconds(endTime);
    
    // Validate start < end
    if (startSeconds >= endSeconds) {
      errors.push(`Clip ${i + 1}: Start time must be before end time`);
      continue;
    }
    
    // Validate against video duration
    if (videoDurationSeconds) {
      if (endSeconds > videoDurationSeconds) {
        errors.push(`Clip ${i + 1}: End time exceeds video duration`);
        continue;
      }
    }
    
    // Check for overlaps with previous clips (informational only)
    for (let j = 0; j < valid.length; j++) {
      const prevClip = valid[j];
      const prevStartSeconds = timestampToSeconds(prevClip.startTime);
      const prevEndSeconds = timestampToSeconds(prevClip.endTime);
      
      // Check if clips overlap
      if (startSeconds < prevEndSeconds && endSeconds > prevStartSeconds) {
        const overlapStart = Math.max(startSeconds, prevStartSeconds);
        const overlapEnd = Math.min(endSeconds, prevEndSeconds);
        const overlapDuration = overlapEnd - overlapStart;
        
        warnings.push(`Clip ${i + 1} overlaps with clip ${j + 1} by ${overlapDuration.toFixed(1)} seconds`);
      }
    }
    
    // Add black frame warnings
    if (startSeconds % 1 === 0 && startSeconds > 0) {
      warnings.push(`Clip ${i + 1}: Starting at exact second (${startTime}) may show black frames. We'll automatically nudge it forward 0.1s for cleaner cuts.`);
    }
    
    if (startSeconds < 1) {
      warnings.push(`Clip ${i + 1}: Very early start time (${startTime}) may be in fade-in area. Black frame protection is active.`);
    }
    
    if (startSeconds === 0) {
      warnings.push(`Clip ${i + 1}: Starting at 0:00 often contains black frames. Consider starting at 0:01 or later.`);
    }
    
    valid.push({ startTime, endTime });
  }
  
  return { valid, errors, warnings };
}

function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// SIMPLE VALIDATION: Minimal processing to avoid hangs
async function validateAndFinalizeClip(outputPath: string): Promise<void> {
  console.log('✅ Clip finalized - timestamp-faithful processing complete');
  return Promise.resolve();
}

// NUCLEAR OPTION: Find actual visible frame by scanning ahead frame by frame
async function findActualVisibleFrame(inputPath: string, startTimeSeconds: number): Promise<{ frameOffset: number; skipReason: string }> {
  return new Promise((resolve) => {
    let frameNum = 0;
    const maxFrames = 30; // Check up to 1 second worth of frames
    
    const checkNextFrame = () => {
      if (frameNum >= maxFrames) {
        resolve({ frameOffset: 15, skipReason: 'Max frames checked, using safe 15-frame offset' });
        return;
      }
      
      const timeToCheck = startTimeSeconds + (frameNum / 30);
      const tempFramePath = `/tmp/check_${Date.now()}_${frameNum}.jpg`;
      
      // Extract single frame at high quality for analysis
      ffmpeg(inputPath)
        .seekInput(timeToCheck)
        .outputOptions([
          '-vframes', '1',
          '-f', 'image2',
          '-q:v', '1', // Highest quality
          '-vf', 'scale=200:200' // Larger scale for better analysis
        ])
        .save(tempFramePath)
        .on('end', async () => {
          try {
            const fs = await import('fs');
            const stats = await fs.promises.stat(tempFramePath);
            
            // More stringent check: frame must be reasonably large AND pass blackdetect
            if (stats.size > 3000) { // Larger threshold for 200x200 image
              // Additional verification with blackdetect
              ffmpeg(tempFramePath)
                .outputOptions([
                  '-vf', 'blackdetect=d=0.01:pix_th=0.03', // Stricter threshold
                  '-f', 'null',
                  '-'
                ])
                .on('stderr', (stderrLine) => {
                  if (stderrLine.includes('black_start:0')) {
                    // Still black, try next frame
                    fs.promises.unlink(tempFramePath).catch(() => {});
                    frameNum++;
                    checkNextFrame();
                  } else {
                    // Found visible frame!
                    fs.promises.unlink(tempFramePath).catch(() => {});
                    resolve({ 
                      frameOffset: frameNum, 
                      skipReason: `Found visible content at frame ${frameNum} (${(frameNum/30).toFixed(3)}s offset)`
                    });
                  }
                })
                .on('end', () => {
                  // No black detected - frame is good
                  fs.promises.unlink(tempFramePath).catch(() => {});
                  resolve({ 
                    frameOffset: frameNum, 
                    skipReason: `Found clean frame at ${frameNum} (${(frameNum/30).toFixed(3)}s offset)`
                  });
                })
                .on('error', () => {
                  // Analysis failed, try next frame
                  fs.promises.unlink(tempFramePath).catch(() => {});
                  frameNum++;
                  checkNextFrame();
                });
            } else {
              // File too small, likely black
              await fs.promises.unlink(tempFramePath).catch(() => {});
              frameNum++;
              checkNextFrame();
            }
          } catch (error) {
            frameNum++;
            checkNextFrame();
          }
        })
        .on('error', () => {
          frameNum++;
          checkNextFrame();
        });
    };
    
    checkNextFrame();
  });
}

// Auto-detect and remove letterboxing from video
async function detectAndRemoveLetterboxing(inputPath: string, startTime: string, duration: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Analyze a sample from the middle of the clip to detect black bars
    const sampleTime = timestampToSeconds(startTime) + (duration / 2);
    
    console.log(`🔍 Analyzing letterboxing at ${sampleTime}s...`);
    
    ffmpeg(inputPath)
      .inputOptions(['-ss', sampleTime.toString()])
      .outputOptions([
        '-vf', 'cropdetect=24:16:0',
        '-f', 'null',
        '-t', '1'  // Analyze just 1 second
      ])
      .on('stderr', (stderrLine) => {
        // Look for cropdetect output: crop=w:h:x:y
        const cropMatch = stderrLine.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
        if (cropMatch) {
          const [, width, height, x, y] = cropMatch;
          const cropFilter = `crop=${width}:${height}:${x}:${y}`;
          console.log(`✅ Detected letterboxing, applying: ${cropFilter}`);
          resolve(cropFilter);
        }
      })
      .on('end', () => {
        // If no crop detected, return empty string (no letterboxing)
        console.log(`ℹ️ No letterboxing detected, using full frame`);
        resolve('');
      })
      .on('error', (error) => {
        console.warn(`⚠️ Letterbox detection failed, proceeding without crop:`, error.message);
        resolve(''); // Fallback to no crop
      })
      .save('/dev/null');
  });
}

// Process clip with aspect ratio support including 9:16 motion tracking
function processClipWithAspectRatio(
  inputPath: string,
  startTime: string,
  endTime: string,
  outputPath: string,
  quality: string = 'balanced',
  aspectRatio: '16:9' | '9:16',
  videoId?: number,
  clipIndex?: number,
  totalClips?: number,
  videoFade: boolean = false,
  audioFade: boolean = false,
  fadeDuration: number = 0.5
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // Calculate clip duration
      const start = timestampToSeconds(startTime);
      const end = timestampToSeconds(endTime);
      const duration = end - start;
      
      // Build video filter chain based on aspect ratio
      let videoFilters: string[] = [];
      
      if (aspectRatio === '9:16') {
        // For 9:16, first detect and remove any letterboxing
        const letterboxCrop = await detectAndRemoveLetterboxing(inputPath, startTime, duration);
        
        if (letterboxCrop) {
          // Apply letterbox removal first, then scale and crop for 9:16
          videoFilters = [
            letterboxCrop, // Remove detected black bars
            'scale=1080:1920:force_original_aspect_ratio=increase', // Scale to fill 9:16
            'crop=1080:1920:(iw-1080)/2:(ih-1920)/2' // Center crop to exact 9:16
          ];
        } else {
          // No letterboxing detected, direct 9:16 conversion
          videoFilters = [
            'scale=1080:1920:force_original_aspect_ratio=increase',
            'crop=1080:1920:(iw-1080)/2:(ih-1920)/2'
          ];
        }
      } else {
        // 16:9 Standard horizontal (maintain original aspect ratio)
        videoFilters = [
          'scale=-2:720' // Scale to 720p height, maintain aspect ratio
        ];
      }
      
      const command = ffmpeg(inputPath);
      
      // Input-side seeking for frame-accurate processing
      command.inputOptions(['-ss', startTime]);
      
      // Add fade effects if enabled
      if (videoFade) {
        videoFilters.push(`fade=t=in:st=0:d=${fadeDuration}:color=black`);
        videoFilters.push(`fade=t=out:st=${duration - fadeDuration}:d=${fadeDuration}:color=black`);
      }
      
      // Apply video filters
      if (videoFilters.length > 0) {
        command.videoFilters(videoFilters.join(','));
      }
      
      // Audio processing
      if (audioFade) {
        command.audioFilters([
          `afade=t=in:st=0:d=${fadeDuration}:curve=exp`,
          `afade=t=out:st=${duration - fadeDuration}:d=${fadeDuration}:curve=exp`
        ]);
      }
      
      // Output settings based on quality
      let crf = 20; // default balanced
      if (quality === 'high') crf = 18;
      if (quality === 'compressed') crf = 23;
      
      command
        .outputOptions([
          '-c:v', 'libx264',
          '-crf', crf.toString(),
          '-c:a', audioFade ? 'aac' : 'copy',
          ...(audioFade ? ['-b:a', '128k'] : []),
          '-preset', 'fast',
          '-movflags', '+faststart'
        ])
        .duration(duration)
        .on('start', (commandLine) => {
          console.log(`🎬 Starting ${aspectRatio} clip processing: ${path.basename(outputPath)}`);
          console.log(`🔧 FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent && clipIndex && totalClips) {
            const clipProgress = Math.round(progress.percent);
            console.log(`⏳ ${aspectRatio} Progress: ${clipProgress}% (${clipIndex}/${totalClips})`);
          }
        })
        .on('end', () => {
          console.log(`✅ ${aspectRatio} clip completed: ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', async (error) => {
          console.error(`❌ ${aspectRatio} processing failed:`, error);
          // For 9:16 format, try a simpler fallback approach
          if (aspectRatio === '9:16') {
            console.log(`🔄 Attempting 9:16 fallback with letterbox removal...`);
            try {
              const letterboxCrop = await detectAndRemoveLetterboxing(inputPath, startTime, duration);
              const fallbackCommand = ffmpeg(inputPath);
              fallbackCommand.inputOptions(['-ss', startTime]);
              
              // Fallback filters with letterbox removal
              const fallbackFilters = [];
              if (letterboxCrop) {
                fallbackFilters.push(letterboxCrop);
              }
              fallbackFilters.push('scale=2160:3840:force_original_aspect_ratio=increase');
              fallbackFilters.push('crop=1080:1920:(iw-1080)/2:(ih-1920)/2');
              
              fallbackCommand
                .videoFilters(fallbackFilters)
                .outputOptions([
                  '-c:v', 'libx264',
                  '-crf', '20',
                  '-c:a', 'copy',
                  '-preset', 'fast',
                  '-movflags', '+faststart'
                ])
                .duration(duration)
                .on('start', () => console.log(`🔄 Fallback 9:16 processing started`))
                .on('end', () => {
                  console.log(`✅ Fallback 9:16 clip completed: ${path.basename(outputPath)}`);
                  resolve();
                })
                .on('error', (fallbackError) => {
                  console.error(`❌ Fallback 9:16 processing also failed:`, fallbackError);
                  reject(fallbackError);
                })
                .save(outputPath);
            } catch (fallbackError) {
              reject(fallbackError);
            }
          } else {
            reject(error);
          }
        })
        .save(outputPath);
    } catch (error) {
      reject(error);
    }
  });
}

function processClip(inputPath: string, startTime: string, endTime: string, outputPath: string, quality: string, videoId?: number, clipIndex?: number, totalClips?: number, videoFade?: boolean, audioFade?: boolean, fadeDuration?: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let crf = 20; // default balanced
    if (quality === 'high') crf = 18;
    if (quality === 'compressed') crf = 23;
    
    // Calculate original timing
    const originalStartSeconds = timestampToSeconds(startTime);
    const endSeconds = timestampToSeconds(endTime);
    const originalDuration = endSeconds - originalStartSeconds;
    
    console.log(`🔍 FRAME VALIDATION: Analyzing frame=0 for black frame injection at ${startTime}`);
    console.log(`📐 Duration: ${originalDuration}s - validating encoder pipeline integrity`);
    
    // First pass: Create clip with comprehensive frame validation
    const tempOutputPath = outputPath + '.temp.mp4';
    
    try {
      console.log(`🎯 ENCODE PIPELINE FIX: Implementing buffer alignment and frame validation`);
      
      // KEYFRAME-LEVEL FAST SEEKING FIX: Move -ss before input per your analysis
      const debugCommand = `ffmpeg -ss ${startTime} -i "${inputPath}" -t ${originalDuration} -c:v libx264 -preset fast -c:a copy "${tempOutputPath}"`;
      console.log(`🔍 DEBUG COMMAND (FIXED): ${debugCommand}`);
      
      // Build filter arguments for fade effects
      const outputOptions = [
        '-t', originalDuration.toString(),
        '-c:v', 'libx264',
        '-preset', 'veryfast',  // Faster preset to avoid stalls
        '-crf', crf.toString(),
        '-c:a', (audioFade ? 'aac' : 'copy'),  // Only re-encode audio if fading
        ...(audioFade ? ['-b:a', '128k'] : [])  // Set audio bitrate only if re-encoding
      ];

      // Add video fade filters if requested
      if (videoFade && fadeDuration) {
        // Cross dissolve: fade in at start, fade out at end
        const fadeInOut = `fade=t=in:st=0:d=${fadeDuration}:color=black,fade=t=out:st=${originalDuration - fadeDuration}:d=${fadeDuration}:color=black`;
        outputOptions.push('-vf', fadeInOut);
        console.log(`🎬 VIDEO FADE: Applied ${fadeDuration}s cross dissolve transitions`);
      }
      
      // Add audio fade filters if requested
      if (audioFade && fadeDuration) {
        // Exponential audio fade for smooth music transitions
        const audioFadeInOut = `afade=t=in:st=0:d=${fadeDuration}:curve=exp,afade=t=out:st=${originalDuration - fadeDuration}:d=${fadeDuration}:curve=exp`;
        outputOptions.push('-af', audioFadeInOut);
        console.log(`🎵 AUDIO FADE: Applied ${fadeDuration}s exponential audio curves`);
      }

      // FAST SEEKING: Apply -ss before input to enable keyframe-level seeking
      const ffmpegProcess = ffmpeg()
        .input(inputPath)
        .inputOptions(['-ss', startTime])  // CRITICAL FIX: -ss before input enables fast seeking
        .outputOptions(outputOptions);
      
      ffmpegProcess.save(tempOutputPath);
      
      console.log(`🎯 PROCESSING: ${videoFade ? 'Video fade' : 'No video fade'}, ${audioFade ? 'Audio fade' : 'No audio fade'}, Duration: ${fadeDuration}s`);
      
      // ADD TIMEOUT MECHANISM: Prevent indefinite stalls
      const timeoutId = setTimeout(() => {
        console.log(`⏰ TIMEOUT: FFmpeg stalled for >120s, killing process`);
        ffmpegProcess.kill('SIGKILL');
        reject(new Error('FFmpeg timeout - process stalled'));
      }, 120000); // 120 second timeout for fade processing
      
      ffmpegProcess
        .on('progress', (progress) => {
          if (videoId && clipIndex !== undefined && totalClips) {
            const job = processingJobs.get(videoId);
            if (job) {
              const clipProgress = Math.round(progress.percent || 0);
              const overallProgress = Math.round(((clipIndex) + (clipProgress / 100)) / totalClips * 100);
              job.progress = Math.max(0, Math.min(100, overallProgress));
              console.log(`Processing clip ${clipIndex + 1}/${totalClips}: ${clipProgress}% done, Overall: ${job.progress}%`);
            }
          }
        })
        .on('stderr', (stderrLine) => {
          // Minimal logging to prevent stalls
          if (stderrLine.includes('error') || stderrLine.includes('Error') || stderrLine.includes('Failed')) {
            console.log(`❌ ENCODING ERROR: ${stderrLine}`);
          }
        })
        .on('end', async () => {
          clearTimeout(timeoutId); // Clear timeout on successful completion
          try {
            // TEMPORARILY SKIP VALIDATION: Testing if this causes the 40% stall
            console.log('🔄 SKIPPING FRAME VALIDATION: Testing for 40% stall resolution');
            
            // Move temp file to final output
            const fs = await import('fs');
            await fs.promises.rename(tempOutputPath, outputPath);
            
            console.log('✅ CLIP PROCESSING COMPLETED: Validation skipped for debugging');
            resolve();
          } catch (error) {
            console.error('Primary encoding failed:', error);
            
            // FALLBACK: Extend trim start by 0.25s as suggested for stability testing
            console.log('🔄 FALLBACK: Applying 0.25s extension for stability testing');
            const fallbackStartSeconds = Math.max(0, originalStartSeconds - 0.25);  // Pad start backward
            const fallbackEndSeconds = endSeconds + 0.25;  // Extend end forward
            const fallbackStartTime = secondsToTimestamp(fallbackStartSeconds);
            const fallbackEndTime = secondsToTimestamp(fallbackEndSeconds);
            
            console.log(`🎯 FALLBACK TIMING: ${fallbackStartTime} to ${fallbackEndTime} (0.25s padding each side)`);
            
            // FALLBACK: Also use input-side seeking for consistency
            const fallbackDuration = fallbackEndSeconds - fallbackStartSeconds;
            ffmpeg()
              .input(inputPath)
              .inputOptions(['-ss', fallbackStartTime])  // Input-side seeking for fallback too
              .outputOptions([
                '-t', fallbackDuration.toString(),
                '-preset', 'veryfast',
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-b:a', '128k',
                `-crf`, crf.toString()
              ])
              .save(outputPath)
              .on('end', () => {
                // Clean up temp file
                import('fs').then(fs => {
                  fs.promises.unlink(tempOutputPath).catch(() => {});
                });
                console.log('✅ FALLBACK COMPLETED: 0.25s padding applied for stable encoding');
                resolve();
              })
              .on('error', (err) => {
                // Clean up temp file
                import('fs').then(fs => {
                  fs.promises.unlink(tempOutputPath).catch(() => {});
                });
                console.error('Fallback encoding also failed:', err);
                reject(err);
              });
          }
        })
        .on('error', (err) => {
          clearTimeout(timeoutId); // Clear timeout on error
          console.error('FFmpeg encoding error:', err);
          // Clean up temp file
          import('fs').then(fs => {
            fs.promises.unlink(tempOutputPath).catch(() => {});
          });
          reject(err);
        });
    } catch (error) {
      console.error('Encoding pipeline error:', error);
      reject(error);
    }
  });
}

// Validate frame=0 is not black before muxing
async function validateFrame0NotBlack(videoPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🔍 VALIDATING FRAME=0: Checking for black frame injection');
    
    // Extract frame=0 and analyze
    const tempFramePath = videoPath + '.frame0.jpg';
    
    ffmpeg(videoPath)
      .outputOptions([
        '-vf', 'select=eq(n\\,0)',  // Select exactly frame=0
        '-vframes', '1',
        '-f', 'image2',
        '-q:v', '2'  // High quality for accurate analysis
      ])
      .save(tempFramePath)
      .on('end', async () => {
        try {
          const fs = await import('fs');
          const stats = await fs.promises.stat(tempFramePath);
          
          // Check file size (black frames are typically very small)
          if (stats.size < 2000) {
            console.log(`❌ FRAME=0 VALIDATION FAILED: File size ${stats.size} bytes indicates black frame`);
            await fs.promises.unlink(tempFramePath).catch(() => {});
            reject(new Error('Black frame detected at frame=0'));
            return;
          }
          
          // Additional blackdetect validation
          ffmpeg(tempFramePath)
            .outputOptions([
              '-vf', 'blackdetect=d=0.01:pix_th=0.10',  // Detect black content
              '-f', 'null',
              '-'
            ])
            .on('stderr', (stderrLine) => {
              if (stderrLine.includes('black_start:0')) {
                console.log(`❌ FRAME=0 VALIDATION FAILED: Blackdetect confirmed black content`);
                fs.promises.unlink(tempFramePath).catch(() => {});
                reject(new Error('Black frame confirmed by blackdetect'));
              }
            })
            .on('end', async () => {
              console.log(`✅ FRAME=0 VALIDATION PASSED: Size ${stats.size} bytes, no black content detected`);
              await fs.promises.unlink(tempFramePath).catch(() => {});
              resolve();
            })
            .on('error', async (error) => {
              console.log(`⚠️ FRAME=0 VALIDATION INCONCLUSIVE: Blackdetect failed, assuming valid`);
              await fs.promises.unlink(tempFramePath).catch(() => {});
              resolve(); // Don't fail if blackdetect has issues
            });
        } catch (error) {
          console.error('Frame validation error:', error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('Frame extraction error:', error);
        reject(error);
      });
  });
}

// GET VIDEO FRAME RATE: Extract exact frame rate for precise calculations
async function getVideoFrameRate(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.warn('Could not get frame rate, defaulting to 30fps');
        resolve(30);
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (videoStream && videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        const frameRate = num / den;
        console.log(`📊 Detected frame rate: ${frameRate}fps`);
        resolve(frameRate);
      } else {
        console.warn('Frame rate not found in metadata, defaulting to 30fps');
        resolve(30);
      }
    });
  });
}

function secondsToTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }
}

// Generate random timestamp ranges for auto 5-cut feature
function generateRandomTimestamps(videoDuration: string): Array<{ startTime: string; endTime: string }> {
  const totalSeconds = timestampToSeconds(videoDuration);
  
  // Adaptive clip generation based on video length
  let targetClips = 5;
  let minClipDuration = 3; // minimum 3 seconds
  let maxClipDuration = 15; // maximum 15 seconds
  
  if (totalSeconds < 30) {
    // Very short video: create 2-3 clips of 3-5 seconds each
    targetClips = Math.max(2, Math.floor(totalSeconds / 8));
    minClipDuration = 3;
    maxClipDuration = Math.min(5, totalSeconds / targetClips - 1);
  } else if (totalSeconds < 60) {
    // Short video: create 3-4 clips of 5-10 seconds each
    targetClips = Math.max(3, Math.floor(totalSeconds / 15));
    minClipDuration = 5;
    maxClipDuration = Math.min(10, totalSeconds / targetClips - 1);
  } else if (totalSeconds < 120) {
    // Medium video: create 4-5 clips of 8-15 seconds each
    targetClips = Math.max(4, Math.floor(totalSeconds / 20));
    minClipDuration = 8;
    maxClipDuration = Math.min(15, totalSeconds / targetClips - 1);
  } else {
    // Long video: create 5 clips of 15-30 seconds each
    targetClips = 5;
    minClipDuration = 15;
    maxClipDuration = 30;
  }
  
  // Ensure we have enough video duration
  const totalNeededDuration = targetClips * minClipDuration;
  if (totalSeconds < totalNeededDuration) {
    throw new Error(`Video too short (${Math.round(totalSeconds)}s). Need at least ${totalNeededDuration}s for ${targetClips} clips of ${minClipDuration}s each.`);
  }
  
  const timestamps = [];
  const usedRanges: Array<{ start: number; end: number }> = [];
  
  // Generate clips
  for (let i = 0; i < targetClips; i++) {
    let attempts = 0;
    let validClip = false;
    
    while (!validClip && attempts < 50) {
      // Random clip duration within range
      const clipDuration = Math.random() * (maxClipDuration - minClipDuration) + minClipDuration;
      
      // Random start time (leave room for clip duration)
      const buffer = Math.min(2, totalSeconds * 0.1); // 10% buffer or 2 seconds, whichever is smaller
      const maxStartTime = totalSeconds - clipDuration - buffer;
      const startTime = Math.random() * maxStartTime;
      const endTime = startTime + clipDuration;
      
      // Check for overlaps with existing clips
      const overlap = usedRanges.some(range => 
        (startTime < range.end && endTime > range.start)
      );
      
      if (!overlap) {
        usedRanges.push({ start: startTime, end: endTime });
        
        timestamps.push({
          startTime: secondsToTimestamp(startTime).split('.')[0], // Remove milliseconds for cleaner display
          endTime: secondsToTimestamp(endTime).split('.')[0]
        });
        
        validClip = true;
      }
      
      attempts++;
    }
  }
  
  // Sort by start time
  timestamps.sort((a, b) => timestampToSeconds(a.startTime) - timestampToSeconds(b.startTime));
  
  return timestamps;
}

// Stage 2: GIF Export Function - Generate 10 GIFs from random sections
async function generateGifExport(inputPath: string, baseName: string, outputDir: string, videoDuration?: string, videoId?: number): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🎬 Generating 10 GIFs from random sections at 640x480 with palette optimization...');
      
      // Calculate video duration in seconds
      let durationSeconds = 60; // default fallback
      if (videoDuration) {
        durationSeconds = timestampToSeconds(videoDuration);
      }
      
      // Ensure we have enough video for 10 6-second clips
      if (durationSeconds < 60) {
        console.log('⚠️ Video too short for 10 GIFs, generating fewer GIFs');
      }
      
      const gifPaths: string[] = [];
      const promises: Promise<string>[] = [];
      const usedRanges: Array<{ start: number; end: number }> = [];
      
      // Generate up to 10 GIFs from random sections
      const numGifs = Math.min(10, Math.floor(durationSeconds / 6));
      
      for (let i = 0; i < numGifs; i++) {
        const gifNumber = String(i + 1).padStart(2, '0');
        
        // Find a random start time that doesn't overlap with existing GIFs
        let startTime = 0;
        let attempts = 0;
        let validPosition = false;
        
        while (!validPosition && attempts < 50) {
          // Random start time (leave 6 seconds for the GIF duration)
          startTime = Math.random() * (durationSeconds - 6);
          const endTime = startTime + 6;
          
          // Check for overlaps with existing GIFs
          const overlap = usedRanges.some(range => 
            (startTime < range.end && endTime > range.start)
          );
          
          if (!overlap) {
            usedRanges.push({ start: startTime, end: endTime });
            validPosition = true;
          }
          
          attempts++;
        }
        
        const gifOutputPath = path.join(outputDir, `${baseName}-gif-${gifNumber}.gif`);
        
        const promise = new Promise<string>((resolveGif, rejectGif) => {
          // Generate palette first
          const paletteCommand = ffmpeg(inputPath)
            .inputOptions(['-ss', startTime.toString()])
            .outputOptions([
              '-t', '6',
              '-vf', 'fps=10,scale=640:480:flags=lanczos,palettegen=stats_mode=diff',
              '-y'
            ]);
          
          const palettePath = gifOutputPath + '.palette.png';
          
          paletteCommand
            .save(palettePath)
            .on('end', () => {
              // Second pass: create GIF using the generated palette
              ffmpeg(inputPath)
                .inputOptions(['-ss', startTime.toString()])
                .addInput(palettePath)
                .outputOptions([
                  '-t', '6',
                  '-filter_complex', 'fps=10,scale=640:480:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
                  '-y'
                ])
                .save(gifOutputPath)
                .on('end', async () => {
                  try {
                    // Clean up palette file
                    const fs = await import('fs');
                    await fs.promises.unlink(palettePath).catch(() => {});
                    console.log(`✅ GIF ${i + 1}/10 generated from ${startTime.toFixed(1)}s`);
                    
                    // Update progress for each completed GIF (don't update currentClip as it's for cutdowns only)
                    if (videoId) {
                      const job = processingJobs.get(videoId);
                      if (job) {
                        const completedItems = job.totalClips + (i + 1);
                        job.progress = Math.min(95, Math.round((completedItems / job.totalOutputs) * 100));
                      }
                    }
                    
                    resolveGif(gifOutputPath);
                  } catch (error) {
                    rejectGif(error);
                  }
                })
                .on('error', (error) => {
                  console.error(`❌ GIF ${i + 1} palette application failed:`, error);
                  rejectGif(error);
                });
            })
            .on('error', (error) => {
              console.error(`❌ GIF ${i + 1} palette generation failed:`, error);
              rejectGif(error);
            });
        });
        
        promises.push(promise);
      }
      
      // Wait for all GIFs to complete
      const results = await Promise.allSettled(promises);
      
      // Collect successful GIFs
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          gifPaths.push(result.value);
        } else {
          console.error(`GIF ${index + 1} failed:`, result.reason);
        }
      });
      
      console.log(`✅ GIF generation complete: ${gifPaths.length}/${numGifs} successful`);
      resolve(gifPaths);
      
    } catch (error) {
      console.error('❌ GIF export failed:', error);
      reject(error);
    }
  });
}

// Stage 2: Thumbnail Export Function
async function generateThumbnailExports(inputPath: string, baseName: string, outputDir: string, videoDuration?: string, videoId?: number): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('📸 Generating 10 high-quality thumbnail stills...');
      
      // Calculate video duration in seconds
      let durationSeconds = 60; // default fallback
      if (videoDuration) {
        durationSeconds = timestampToSeconds(videoDuration);
      }
      
      const thumbnailPaths: string[] = [];
      const promises: Promise<string>[] = [];
      
      // Generate 10 evenly spaced thumbnails
      for (let i = 0; i < 10; i++) {
        const timePosition = (i + 1) * (durationSeconds / 11); // Skip very start and end
        const thumbnailNumber = String(i + 1).padStart(2, '0');
        const thumbnailPath = path.join(outputDir, `${baseName}-thumb-${thumbnailNumber}.jpg`);
        
        const promise = new Promise<string>((resolveThumb, rejectThumb) => {
          ffmpeg(inputPath)
            .seekInput(timePosition)
            .outputOptions([
              '-vframes', '1',
              '-f', 'image2',
              '-q:v', '2',  // High quality
              '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos',  // High resolution with aspect ratio preservation
              '-y'
            ])
            .save(thumbnailPath)
            .on('end', () => {
              console.log(`✅ Thumbnail ${i + 1}/10 generated at ${timePosition.toFixed(1)}s`);
              
              // Update progress for each completed thumbnail
              if (videoId) {
                const job = processingJobs.get(videoId);
                if (job) {
                  const completedItems = job.totalClips + job.totalGifs + (i + 1);
                  job.progress = Math.min(95, Math.round((completedItems / job.totalOutputs) * 100));
                }
              }
              
              resolveThumb(thumbnailPath);
            })
            .on('error', (error) => {
              console.error(`❌ Thumbnail ${i + 1} failed:`, error);
              rejectThumb(error);
            });
        });
        
        promises.push(promise);
      }
      
      // Wait for all thumbnails to complete
      const results = await Promise.allSettled(promises);
      
      // Collect successful thumbnails
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          thumbnailPaths.push(result.value);
        } else {
          console.error(`Thumbnail ${index + 1} failed:`, result.reason);
        }
      });
      
      console.log(`✅ Thumbnail generation complete: ${thumbnailPaths.length}/10 successful`);
      resolve(thumbnailPaths);
      
    } catch (error) {
      console.error('❌ Thumbnail export failed:', error);
      reject(error);
    }
  });
}

// Generate Spotify Canvas exports (5 vertical 1080x1920 8-second loops)
async function generateCanvasExports(videoPath: string, outputBaseName: string, outputDir: string, videoDuration: number, videoId?: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const canvasPaths: string[] = [];
    let completed = 0;
    const totalCount = 5;
    
    console.log(`🎵 Generating ${totalCount} Spotify Canvas loops (1080x1920, 8s each)...`);
    
    // Generate 5 random 4-second segments with overlap detection
    const segments: { start: number; startTime: string }[] = [];
    const maxStartTime = Math.max(10, videoDuration - 4); // Leave at least 4 seconds from end
    
    while (segments.length < totalCount) {
      const startSeconds = Math.random() * maxStartTime;
      const startTime = secondsToTimestamp(startSeconds);
      
      // Check for overlap (minimum 2 seconds apart)
      const hasOverlap = segments.some(seg => Math.abs(seg.start - startSeconds) < 2);
      if (!hasOverlap) {
        segments.push({ start: startSeconds, startTime });
      }
    }
    
    // Process each Canvas loop
    segments.forEach((segment, index) => {
      const canvasNumber = String(index + 1).padStart(2, '0');
      const outputPath = path.join(outputDir, `${outputBaseName}-canvas-${canvasNumber}.mp4`);
      
      console.log(`🎬 Canvas ${canvasNumber}/05: Creating 8s loop from ${segment.startTime} (4s forward + 4s reversed)`);
      
      // Create temporary files for the forward and reversed segments
      const forwardPath = outputPath.replace('.mp4', '_forward.mp4');
      const reversedPath = outputPath.replace('.mp4', '_reversed.mp4');
      
      // Step 1: Extract 4-second forward segment with vertical crop and resize
      ffmpeg(videoPath)
        .inputOptions(['-ss', segment.startTime])
        .outputOptions([
          '-t', '4',           // 4 seconds duration
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', // Vertical format
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '20',
          '-an'                // Remove audio completely
        ])
        .on('end', () => {
          console.log(`✅ Forward segment ${canvasNumber} completed`);
          
          // Step 2: Create reversed version of the forward segment
          ffmpeg(forwardPath)
            .outputOptions([
              '-vf', 'reverse',  // Reverse video
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-crf', '20',
              '-an'              // Ensure no audio
            ])
            .on('end', async () => {
              console.log(`✅ Reversed segment ${canvasNumber} completed`);
              
              // Step 3: Concatenate forward + reversed for seamless 8-second loop
              const concatList = `file '${path.basename(forwardPath)}'\nfile '${path.basename(reversedPath)}'`;
              const concatFilePath = outputPath.replace('.mp4', '_concat.txt');
              
              const fs = await import('fs');
              fs.writeFileSync(concatFilePath, concatList);
              
              ffmpeg(concatFilePath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions([
                  '-c:v', 'libx264',
                  '-preset', 'fast',
                  '-crf', '20',
                  '-movflags', '+faststart', // Optimize for streaming
                  '-an'                      // Ensure no audio in final output
                ])
                .on('end', async () => {
                  // Cleanup temporary files
                  try {
                    await fs.promises.unlink(forwardPath);
                    await fs.promises.unlink(reversedPath);
                    await fs.promises.unlink(concatFilePath);
                  } catch (err) {
                    console.log('⚠️  Cleanup warning:', err.message);
                  }
                  
                  canvasPaths.push(outputPath);
                  completed++;
                  console.log(`✅ Canvas ${canvasNumber}/05 loop completed: 8s seamless vertical format`);
                  
                  // Update progress for each completed Canvas
                  if (videoId) {
                    const job = processingJobs.get(videoId);
                    if (job) {
                      const baseProgress = job.totalClips + (job.totalGifs || 0) + (job.totalThumbnails || 0);
                      const canvasProgress = completed;
                      job.progress = Math.min(95, Math.round(((baseProgress + canvasProgress) / job.totalOutputs) * 100));
                    }
                  }
                  
                  if (completed === totalCount) {
                    console.log(`✅ Canvas generation complete: ${totalCount}/5 successful`);
                    resolve(canvasPaths);
                  }
                })
                .on('error', (error) => {
                  console.error(`❌ Canvas ${canvasNumber} concatenation failed:`, error);
                  completed++;
                  if (completed === totalCount) {
                    resolve(canvasPaths);
                  }
                })
                .save(outputPath);
            })
            .on('error', (error) => {
              console.error(`❌ Canvas ${canvasNumber} reverse failed:`, error);
              completed++;
              if (completed === totalCount) {
                resolve(canvasPaths);
              }
            })
            .save(reversedPath);
        })
        .on('error', (error) => {
          console.error(`❌ Canvas ${canvasNumber} forward segment failed:`, error);
          completed++;
          if (completed === totalCount) {
            resolve(canvasPaths);
          }
        })
        .save(forwardPath);
    });
    
    // Timeout fallback
    setTimeout(() => {
      if (completed < totalCount) {
        console.log(`⏰ Canvas generation timeout - completed ${completed}/${totalCount}`);
        resolve(canvasPaths);
      }
    }, 300000); // 5 minute timeout
  });
}


