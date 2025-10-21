import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Video, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Video as VideoType } from "@shared/schema";

interface VideoUploadProps {
  onVideoUpload: (video: VideoType) => void;
  uploadedVideo: VideoType | null;
}

export default function VideoUpload({ onVideoUpload, uploadedVideo }: VideoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  // Optimized chunked upload for 500MB-5GB files
  const uploadFileInChunks = async (file: File, chunkSize: number): Promise<Response> => {
    const totalChunks = Math.ceil(file.size / chunkSize);
    let uploadedBytes = 0;
    
    // Conservative parallelism to prevent memory issues and hangs
    const fileSizeGB = file.size / (1024 * 1024 * 1024);
    const batchSize = 3; // Reduced to prevent timeouts and memory pressure
    const uploadId = Math.random().toString(36).substring(7);
    
    console.log(`Uploading ${totalChunks} chunks with ${batchSize} parallel connections`);
    
    for (let batchStart = 0; batchStart < totalChunks; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, totalChunks);
      const batchPromises = [];
      
      for (let i = batchStart; i < batchEnd; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('uploadId', uploadId);
        formData.append('fileName', file.name);
        
        const chunkPromise = fetch('/api/upload-chunk', {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(60000), // 60 second timeout per chunk
        }).then(response => {
          if (!response.ok) {
            console.error(`Chunk ${i} failed:`, response.statusText);
            throw new Error(`Chunk ${i} failed: ${response.statusText}`);
          }
          uploadedBytes += chunk.size;
          const progress = Math.round((uploadedBytes / file.size) * 100);
          setUploadProgress(progress);
          console.log(`Chunk ${i+1}/${totalChunks} uploaded (${progress}%)`);
          return response;
        });
        
        batchPromises.push(chunkPromise);
      }
      
      await Promise.all(batchPromises);
    }
    
    // Finalize the upload
    const response = await fetch('/api/finalize-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        fileName: file.name,
        totalSize: file.size,
        totalChunks,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to finalize upload');
    }
    
    return response;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    console.log('Starting upload for file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    // Pre-upload optimizations
    setIsUploading(true);
    setUploadProgress(0);
    
    // Show immediate feedback
    toast({
      title: "Upload started",
      description: `Uploading ${file.name}...`,
    });
    
    try {
      // Conservative chunk size to prevent memory issues and hangs
      const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks for stability
      const shouldUseChunkedUpload = file.size > 100 * 1024 * 1024; // 100MB threshold
      
      let response: Response;
      
      if (shouldUseChunkedUpload) {
        const fileSizeMB = Math.round(file.size / 1024 / 1024);
        console.log(`Large file detected (${fileSizeMB}MB), using optimized chunked upload...`);
        
        // Conservative chunk size for all large files to prevent hangs
        const optimizedChunkSize = CHUNK_SIZE; // 50MB for all large files
        
        toast({
          title: "Optimizing upload",
          description: `Using ${fileSizeMB > 1000 ? 'high-speed' : 'fast'} upload for ${fileSizeMB}MB file`,
        });
        
        response = await uploadFileInChunks(file, optimizedChunkSize);
      } else {
        console.log('Regular upload for small file...');
        const formData = new FormData();
        formData.append('video', file);
        
        // Fast single upload for smaller files
        response = await new Promise<Response>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.timeout = 120000; // 2 minute timeout
          
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(progress);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: { 'Content-Type': 'application/json' }
              }));
            } else {
              reject(new Error(`${xhr.status}: ${xhr.responseText}`));
            }
          });

          xhr.addEventListener('error', () => reject(new Error('Upload failed')));
          xhr.addEventListener('timeout', () => reject(new Error('Upload timeout')));

          xhr.open('POST', '/api/upload');
          xhr.send(formData);
        });
      }

      console.log('Response received:', response.status);
      const video = await response.json();
      console.log('Video object:', video);
      
      onVideoUpload(video);
      toast({
        title: "Upload successful",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = "Failed to upload video. Please try again.";
      
      // Try to extract the error message from the server response
      if (error instanceof Error && error.message.includes(':')) {
        const messagePart = error.message.split(': ')[1];
        try {
          const errorData = JSON.parse(messagePart);
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // If parsing fails, use the part after the colon
          errorMessage = messagePart || errorMessage;
        }
      }
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [onVideoUpload, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.mkv', '.avi', '.webm']
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleRemoveVideo = () => {
    // Reset upload state (in a real app, you might want to delete the file from server)
    window.location.reload();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (uploadedVideo) {
    return (
      <div className="mt-6">
        <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
          <div className="w-16 h-16 bg-gray-300 rounded-lg flex items-center justify-center">
            <Play className="text-gray-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">{uploadedVideo.originalName}</h4>
            <p className="text-sm text-gray-500">
              Duration: {uploadedVideo.duration || 'Processing...'} • Size: {formatFileSize(uploadedVideo.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveVideo}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-brand-green bg-green-50' : 'border-gray-300 hover:border-brand-green'
      }`}
    >
      <input {...getInputProps()} />
      
      {isUploading ? (
        <div className="flex flex-col items-center">
          <Upload className="text-4xl text-brand-green mb-4 animate-pulse" />
          <p className="text-lg font-medium text-gray-700 mb-2">Uploading...</p>
          <div className="w-full max-w-xs mb-2">
            <div className="bg-gray-200 rounded-full h-2">
              <div 
                className="bg-brand-green h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1 text-center">{uploadProgress}%</p>
          </div>
          <p className="text-sm text-gray-500">Please wait while your video is being uploaded.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Video className="text-4xl text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isDragActive ? "Drop your video here" : "Drop your video here or click to browse"}
          </p>
          <p className="text-sm text-gray-500 mb-4">Supports .mp4, .mov, .mkv and other common formats</p>
          <Button className="bg-brand-green text-white hover:bg-brand-green-dark">
            Choose File
          </Button>
        </div>
      )}
    </div>
  );
}
