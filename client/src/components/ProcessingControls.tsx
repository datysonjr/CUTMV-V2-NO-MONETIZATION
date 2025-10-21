import { useState, useEffect, useRef } from "react";
import { Download, Loader2, CheckCircle, Clock, Scissors, ImageIcon, Volume2, FileImage, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Video, Timestamp } from "@shared/schema";

interface ProcessingControlsProps {
  video: Video | null;
  timestampText: string;
  onProcessingComplete: () => void;
  generateCutdowns?: boolean;
  generateGif?: boolean;
  generateThumbnails?: boolean;
  generateCanvas?: boolean;
  aspectRatios?: ('16:9' | '9:16')[];
  onAspectRatiosChange?: (ratios: ('16:9' | '9:16')[]) => void;
}

interface ProcessingStatus {
  isProcessing: boolean;
  progress: number;
  currentClip: number;
  totalClips: number;
  totalGifs?: number;
  totalThumbnails?: number;
  totalCanvas?: number;
  totalOutputs?: number;
  processedClips: string[];
  errors: string[];
  downloadPath?: string;
  startTime?: number;
  estimatedTimeLeft?: number;
  canCancel: boolean;
}

export default function ProcessingControls({
  video,
  timestampText,
  onProcessingComplete,
  generateCutdowns = false,
  generateGif = false,
  generateThumbnails = false,
  generateCanvas = false,
  aspectRatios = ['16:9'],
  onAspectRatiosChange,
}: ProcessingControlsProps) {
  const [outputName, setOutputName] = useState("");
  const [quality, setQuality] = useState("balanced");
  const [videoFade, setVideoFade] = useState(false);
  const [audioFade, setAudioFade] = useState(false);
  const [fadeDuration, setFadeDuration] = useState("0.5");
  const [status, setStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    progress: 0,
    currentClip: 0,
    totalClips: 0,
    processedClips: [],
    errors: [],
    canCancel: true,
  });
  const { toast } = useToast();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set default output name when video changes
  useEffect(() => {
    if (video && !outputName) {
      const name = video.originalName.replace(/\.[^/.]+$/, ""); // Remove extension
      setOutputName(name);
    }
  }, [video, outputName]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const pollProgress = async (videoId: number) => {
    try {
      const response = await fetch(`/api/processing-progress/${videoId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Raw progress data from server:', data);
        return data;
      }
      console.log('Progress poll failed with status:', response.status);
      return null;
    } catch (error) {
      console.error('Progress polling error:', error);
      return null;
    }
  };

  const handleProcessClips = async () => {
    if (!video) {
      toast({
        title: "Cannot process",
        description: "Please upload a video first.",
        variant: "destructive",
      });
      return;
    }

    if (!generateCutdowns && !generateGif && !generateThumbnails && !generateCanvas) {
      toast({
        title: "Nothing to process",
        description: "Please enable at least one generation option.",
        variant: "destructive",
      });
      return;
    }

    if (generateCutdowns && !timestampText.trim()) {
      toast({
        title: "Timestamps required",
        description: "Please add timestamps for cutdown generation.",
        variant: "destructive",
      });
      return;
    }

    setStatus({
      isProcessing: true,
      progress: 0,
      currentClip: 0,
      totalClips: 0,
      processedClips: [],
      errors: [],
      canCancel: true,
      startTime: Date.now(),
    });

    try {
      // Start the processing job and poll for progress
      const processPromise = apiRequest('POST', '/api/process-clips-direct', {
        videoId: video.id,
        timestampText: generateCutdowns ? timestampText : '',
        outputName: outputName || video.originalName.replace(/\.[^/.]+$/, ""),
        quality,
        videoFade,
        audioFade,
        fadeDuration: parseFloat(fadeDuration),
        aspectRatios,
        generateGif,
        generateThumbnails,
        generateCanvas
      });

      // Clear any existing polling interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      // Poll immediately once
      const initialProgress = await pollProgress(video.id);
      if (initialProgress && initialProgress.status === 'completed') {
        setStatus(prev => ({
          ...prev,
          isProcessing: false,
          progress: 100,
          currentClip: initialProgress.currentClip || 1,
          totalClips: initialProgress.totalClips || 1,
          downloadPath: initialProgress.downloadPath,
        }));
        
        toast({
          title: "Processing Complete!",
          description: `Successfully processed ${initialProgress.totalClips} clips`,
        });
        
        onProcessingComplete();
        return; // Exit early if already completed
      }

      // Start polling for progress updates
      pollIntervalRef.current = setInterval(async () => {
        const progressData = await pollProgress(video.id);
        if (progressData) {
          console.log('Progress update received:', progressData);
          setStatus(prev => {
            // Calculate estimated time left with smoothing
            let estimatedTimeLeft;
            if (prev.startTime && progressData.progress > 5) {
              const elapsed = Date.now() - prev.startTime;
              const progressRatio = progressData.progress / 100;
              const totalEstimatedTime = elapsed / progressRatio;
              const rawTimeLeft = Math.max(0, totalEstimatedTime - elapsed);
              
              // Smooth the time estimation to prevent jumping
              estimatedTimeLeft = prev.estimatedTimeLeft ? 
                (prev.estimatedTimeLeft * 0.8 + rawTimeLeft * 0.2) : 
                rawTimeLeft;
            } else {
              estimatedTimeLeft = prev.estimatedTimeLeft;
            }

            const newStatus = {
              ...prev,
              progress: progressData.progress || 0,
              currentClip: progressData.currentClip || 0,
              totalClips: progressData.totalClips || 0,
              totalGifs: progressData.totalGifs || 0,
              totalThumbnails: progressData.totalThumbnails || 0,
              totalCanvas: progressData.totalCanvas || 0,
              totalOutputs: progressData.totalOutputs || 0,
              errors: progressData.errors || [],
              estimatedTimeLeft,
            };
            console.log('New status:', newStatus);
            return newStatus;
          });

          // Check if processing is complete
          if (progressData.status === 'completed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setStatus(prev => ({
              ...prev,
              isProcessing: false,
              progress: 100,
              totalClips: progressData.totalClips || 0,
              totalGifs: progressData.totalGifs || 0,
              totalThumbnails: progressData.totalThumbnails || 0,
              totalCanvas: progressData.totalCanvas || 0,
              totalOutputs: progressData.totalOutputs || 0,
              downloadPath: progressData.downloadPath,
            }));

            const outputs = [];
            if (progressData.totalClips > 0) outputs.push(`${progressData.totalClips} clips`);
            if (progressData.totalGifs > 0) outputs.push(`${progressData.totalGifs} GIFs`);
            if (progressData.totalThumbnails > 0) outputs.push(`${progressData.totalThumbnails} thumbnails`);
            if (progressData.totalCanvas > 0) outputs.push(`${progressData.totalCanvas} Canvas loops`);
            
            toast({
              title: "Processing Complete!",
              description: `Successfully processed ${outputs.join(', ')}`,
            });

            onProcessingComplete();
          } else if (progressData.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setStatus(prev => ({
              ...prev,
              isProcessing: false,
              errors: progressData.errors || ['Processing failed'],
            }));

            toast({
              title: "Processing Failed",
              description: progressData.errors?.[0] || "Failed to process clips",
              variant: "destructive",
            });
          }
        }
      }, 1000); // Poll every second

      // Wait for the processing request to complete as backup
      try {
        await processPromise;
      } catch (processError) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        throw processError;
      }

    } catch (error: any) {
      console.error('Processing error:', error);
      setStatus(prev => ({
        ...prev,
        isProcessing: false,
        errors: [error.message || "Failed to process clips"],
      }));

      toast({
        title: "Processing failed",
        description: "Failed to process video clips. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    if (!video) return;
    
    try {
      await apiRequest('POST', `/api/cancel-processing/${video.id}`);
      setStatus(prev => ({
        ...prev,
        isProcessing: false,
        canCancel: false,
      }));
      
      // Clear polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      toast({
        title: "Processing Canceled",
        description: "Video processing has been stopped.",
      });
    } catch (error) {
      toast({
        title: "Failed to cancel",
        description: "Could not cancel processing. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (status.downloadPath) {
      window.open(status.downloadPath, '_blank');
    }
  };

  const formatTimeLeft = (ms: number): string => {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
      return `About ${minutes} min ${seconds} sec left`;
    } else {
      return `About ${seconds} sec left`;
    }
  };

  const canProcess = video && (generateCutdowns || generateGif || generateThumbnails || generateCanvas) && !status.isProcessing;

  return (
    <div className="space-y-4">
      {/* Output Settings */}
      {!status.isProcessing && !status.downloadPath && (
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
          <h3 className="font-medium text-gray-800 mb-3">Output Settings</h3>
          
          {/* Quality Selection */}
          <div className="space-y-2">
            <Label htmlFor="quality">Quality</Label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger>
                <SelectValue placeholder="Select quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High Quality (larger files)</SelectItem>
                <SelectItem value="balanced">Balanced (recommended)</SelectItem>
                <SelectItem value="compressed">Compressed (smaller files)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Music Video Features (only for cutdowns) */}
          {generateCutdowns && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="font-medium text-gray-700 flex items-center gap-2">
                <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-1 rounded-md text-xs">MUSIC VIDEO</span>
                Creative Effects
              </h4>
              
              {/* Video Fade Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <div>
                    <Label className="text-sm font-medium">Video Fade In/Out</Label>
                    <p className="text-xs text-gray-500">Smooth visual transitions</p>
                  </div>
                </div>
                <Switch
                  checked={videoFade}
                  onCheckedChange={setVideoFade}
                />
              </div>

              {/* Audio Fade Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-green-600" />
                  <div>
                    <Label className="text-sm font-medium">Audio Fade In/Out</Label>
                    <p className="text-xs text-gray-500">Exponential audio curve</p>
                  </div>
                </div>
                <Switch
                  checked={audioFade}
                  onCheckedChange={setAudioFade}
                />
              </div>

              {/* Fade Duration */}
              {(videoFade || audioFade) && (
                <div className="space-y-2 pl-6 border-l-2 border-purple-200">
                  <Label className="text-sm">Fade Duration</Label>
                  <Select 
                    value={fadeDuration} 
                    onValueChange={(value) => setFadeDuration(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select fade duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.3">0.3 seconds (Quick)</SelectItem>
                      <SelectItem value="0.5">0.5 seconds (Standard)</SelectItem>
                      <SelectItem value="0.8">0.8 seconds (Smooth)</SelectItem>
                      <SelectItem value="1.0">1.0 seconds (Cinematic)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Show current Stage 2 settings (read-only) */}
          {(generateGif || generateThumbnails) && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="font-medium text-gray-700 flex items-center gap-2">
                <span className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-2 py-1 rounded-md text-xs">STAGE 2</span>
                Selected Exports
              </h4>
              
              {generateGif && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileImage className="w-4 h-4 text-orange-600" />
                  <span>10 GIFs (6-second clips, 640x480)</span>
                </div>
              )}
              
              {generateThumbnails && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Image className="w-4 h-4 text-purple-600" />
                  <span>10 Thumbnails (high-quality stills)</span>
                </div>
              )}
              
              {generateCanvas && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-4 h-4 bg-gradient-to-r from-purple-500 to-green-500 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">S3</span>
                  </div>
                  <span>5 Spotify Canvas Loops (1080x1920, 8s)</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Aspect Ratio Export Options */}
      {generateCutdowns && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded flex items-center justify-center">
              <span className="text-xs font-bold text-white">AR</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Aspect Ratio Export Options
            </h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose your export format(s) - select multiple for dual format exports
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-5 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-600 rounded flex items-center justify-center">
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-300">16:9</span>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Widescreen</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">YouTube, desktop platforms</p>
                </div>
              </div>
              <Switch
                checked={aspectRatios.includes('16:9')}
                onCheckedChange={(checked) => {
                  if (onAspectRatiosChange) {
                    const newRatios = checked 
                      ? [...aspectRatios.filter(r => r !== '16:9'), '16:9']
                      : aspectRatios.filter(r => r !== '16:9');
                    onAspectRatiosChange(newRatios.length === 0 ? ['16:9'] : newRatios);
                  }
                }}
              />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-8 bg-purple-100 dark:bg-purple-900 border border-purple-300 dark:border-purple-600 rounded flex items-center justify-center">
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-300 transform rotate-90">9:16</span>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vertical + Motion Tracking</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">TikTok, Reels, Stories</p>
                </div>
              </div>
              <Switch
                checked={aspectRatios.includes('9:16')}
                onCheckedChange={(checked) => {
                  if (onAspectRatiosChange) {
                    const newRatios = checked 
                      ? [...aspectRatios.filter(r => r !== '9:16'), '9:16']
                      : aspectRatios.filter(r => r !== '9:16');
                    onAspectRatiosChange(newRatios.length === 0 ? ['16:9'] : newRatios);
                  }
                }}
              />
            </div>
          </div>
          
          {aspectRatios.length > 1 && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                Dual Export: Both {aspectRatios.join(' and ')} versions will be generated
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Organized in separate folders: "clips (16x9)" and "clips (9x16)"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Process Button */}
      {!status.isProcessing && !status.downloadPath && (
        <Button
          onClick={handleProcessClips}
          disabled={!canProcess}
          className="w-full bg-brand-green text-white hover:bg-brand-green-dark py-4 text-lg font-semibold"
        >
          <Scissors className="w-5 h-5 mr-2" />
          {(() => {
            const selectedTypes = [];
            if (generateCutdowns) selectedTypes.push('Cutdowns');
            if (generateGif) selectedTypes.push('GIFs');
            if (generateThumbnails) selectedTypes.push('Thumbnails');
            if (generateCanvas) selectedTypes.push('Spotify Canvas');
            
            if (selectedTypes.length === 0) {
              return 'Select content to generate';
            }
            
            const fadeText = (generateCutdowns && (videoFade || audioFade)) ? ' with Fades' : '';
            return `Generate ${selectedTypes.join(' & ')}${fadeText}`;
          })()}
        </Button>
      )}

      {/* Processing Progress */}
      {status.isProcessing && (
        <div className="text-center py-8 space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <Loader2 className="w-6 h-6 text-brand-green animate-spin" />
            <h3 className="text-lg font-semibold text-gray-800">
              {status.totalClips > 0 && generateCutdowns
                ? `Processing clip ${status.currentClip} of ${status.totalClips}`
                : generateCanvas && !generateGif && !generateThumbnails
                ? `Generating Spotify Canvas... (${Math.round(status.progress)}%)`
                : generateGif && !generateThumbnails && !generateCanvas
                ? `Generating GIFs... (${Math.round(status.progress)}%)`
                : generateThumbnails && !generateGif && !generateCanvas
                ? `Generating thumbnails... (${Math.round(status.progress)}%)`
                : `Creating exports... (${Math.round(status.progress)}%)`
              }
            </h3>
          </div>
          
          {(status.progress > 0) && (
            <div className="max-w-md mx-auto space-y-3">
              <div className="space-y-2">
                <Progress 
                  value={status.progress} 
                  className="h-3 bg-gray-200"
                />
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-700">
                    {Math.round(status.progress)}% complete
                  </span>
                  {status.estimatedTimeLeft && status.progress > 5 && (
                    <span className="text-gray-500">
                      {formatTimeLeft(status.estimatedTimeLeft)}
                    </span>
                  )}
                </div>
              </div>
              
              {status.canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="mt-4"
                >
                  Cancel Processing
                </Button>
              )}
            </div>
          )}
          
          {status.progress === 0 && (
            <p className="text-sm text-gray-500">
              {generateCanvas && !generateGif && !generateThumbnails ? "Preparing to generate Spotify Canvas..." :
               generateGif && generateThumbnails ? "Preparing to generate GIFs and thumbnails..." :
               generateGif ? "Preparing to generate GIFs..." :
               generateThumbnails ? "Preparing to generate thumbnails..." :
               "Preparing clips for processing..."}
            </p>
          )}
        </div>
      )}

      {/* Processing Errors */}
      {status.errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-red-600">Issues During Processing:</h4>
          {status.errors.map((error, index) => (
            <Alert key={index} variant="destructive" className="text-left">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Success & Download Section */}
      {status.downloadPath && !status.isProcessing && (
        <div className="text-center py-8">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-800 mb-2">
              {(() => {
                if (status.totalClips > 0) return 'All clips ready!';
                const activeTypes = [
                  status.totalGifs > 0 && 'GIFs',
                  status.totalThumbnails > 0 && 'thumbnails',
                  status.totalCanvas > 0 && 'Canvas loops'
                ].filter(Boolean);
                if (activeTypes.length > 1) return 'All exports ready!';
                if (status.totalGifs > 0) return 'All GIFs ready!';
                if (status.totalThumbnails > 0) return 'All thumbnails ready!';
                if (status.totalCanvas > 0) return 'All Canvas loops ready!';
                return 'All content ready!';
              })()}
            </h3>
            <p className="text-green-700 mb-6">
              Successfully processed {(() => {
                const outputs = [];
                if (status.totalClips > 0) outputs.push(`${status.totalClips} clips`);
                if (status.totalGifs > 0) outputs.push(`${status.totalGifs} GIFs`);
                if (status.totalThumbnails > 0) outputs.push(`${status.totalThumbnails} thumbnails`);
                if (status.totalCanvas > 0) outputs.push(`${status.totalCanvas} Canvas loops`);
                return outputs.length > 0 ? outputs.join(', ') : 'content';
              })()} and packaged them for download.
            </p>
            <Progress value={100} className="h-2 mb-4 bg-green-100" />
            <Button
              onClick={handleDownload}
              size="lg"
              className="bg-green-600 text-white hover:bg-green-700 px-8 py-4 text-lg font-semibold"
            >
              <Download className="w-6 h-6 mr-3" />
              Download ZIP File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
