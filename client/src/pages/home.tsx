/*
 * © 2025 Full Digital LLC. All Rights Reserved.
 * CUTMV - Music Video Cut-Down Tool
 * Proprietary software - unauthorized use prohibited
 */

import { useState } from "react";
import { Scissors, Upload, Clock, Download, FileImage, Image } from "lucide-react";
import VideoUpload from "@/components/VideoUpload";
import TimestampInput from "@/components/TimestampInput";
import TimestampPreview from "@/components/TimestampPreview";
import ProcessingControls from "@/components/ProcessingControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Video, Timestamp } from "@shared/schema";
import fdLogo from "@/assets/fd-logo.png";

export default function Home() {
  const [uploadedVideo, setUploadedVideo] = useState<Video | null>(null);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [timestampText, setTimestampText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [generateCutdowns, setGenerateCutdowns] = useState(false);
  const [generateGif, setGenerateGif] = useState(false);
  const [generateThumbnails, setGenerateThumbnails] = useState(false);
  const [generateCanvas, setGenerateCanvas] = useState(false);
  const [aspectRatios, setAspectRatios] = useState<('16:9' | '9:16')[]>(['16:9']);

  const handleVideoUpload = (video: Video) => {
    setUploadedVideo(video);
  };

  const handleTimestampsParsed = (data: { timestamps: Timestamp[]; errors: string[]; warnings: string[] }) => {
    setTimestamps(data.timestamps);
    setErrors(data.errors);
    setWarnings(data.warnings);
  };

  const handleProcessingComplete = () => {
    // Processing completed, user can download
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-brand-black shadow-lg border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Scissors className="text-brand-green text-2xl mr-3" />
              <h1 className="text-2xl font-bold text-white">CUTMV</h1>
              <span className="ml-4 text-sm text-gray-300">Music Video Cut-Down Tool</span>
            </div>
            <nav className="hidden md:flex items-center space-x-4">
              <a href="/terms" className="text-gray-300 hover:text-brand-green transition-colors text-sm">
                Terms
              </a>
              <a href="/privacy" className="text-gray-300 hover:text-brand-green transition-colors text-sm">
                Privacy
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Step 1: Video Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Upload className="text-brand-green mr-2" />
                1. Upload Video
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VideoUpload onVideoUpload={handleVideoUpload} uploadedVideo={uploadedVideo} />
            </CardContent>
          </Card>

          {/* Step 1.5: Export Options (visible after video upload) */}
          {uploadedVideo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="flex items-center justify-center w-6 h-6 bg-brand-green text-white rounded-full text-sm font-semibold mr-2">1.5</span>
                  Export Options
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Select what you want to generate from your video:
                  </p>
                  
                  {/* Cutdowns Toggle */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Scissors className="w-5 h-5 text-brand-green" />
                      <div>
                        <Label className="text-base font-medium">Generate Cutdowns</Label>
                        <p className="text-sm text-gray-500">Create clips from custom timestamps</p>
                      </div>
                    </div>
                    <Switch
                      checked={generateCutdowns}
                      onCheckedChange={setGenerateCutdowns}
                    />
                  </div>

                  {/* GIF Export Toggle */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileImage className="w-5 h-5 text-orange-600" />
                      <div>
                        <Label className="text-base font-medium">Generate GIFs</Label>
                        <p className="text-sm text-gray-500">10 random 6-second clips, 640x480</p>
                      </div>
                    </div>
                    <Switch
                      checked={generateGif}
                      onCheckedChange={setGenerateGif}
                    />
                  </div>

                  {/* Thumbnail Export Toggle */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Image className="w-5 h-5 text-purple-600" />
                      <div>
                        <Label className="text-base font-medium">Generate Thumbnails</Label>
                        <p className="text-sm text-gray-500">10 high-quality stills</p>
                      </div>
                    </div>
                    <Switch
                      checked={generateThumbnails}
                      onCheckedChange={setGenerateThumbnails}
                    />
                  </div>

                  {/* Spotify Canvas Toggle - Stage 3 */}
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-gradient-to-r from-purple-50 to-green-50 border-purple-500">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 bg-gradient-to-r from-purple-500 to-green-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">S3</span>
                      </div>
                      <div>
                        <Label className="text-base font-medium">Generate Spotify Canvas</Label>
                        <p className="text-sm text-gray-500">5 vertical 1080x1920 8-second loops</p>
                      </div>
                    </div>
                    <Switch
                      checked={generateCanvas}
                      onCheckedChange={setGenerateCanvas}
                    />
                  </div>
                  
                  {(generateCutdowns || generateGif || generateThumbnails || generateCanvas) && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-700">
                        <strong>Ready to generate:</strong> {
                          [
                            generateCutdowns && 'Cutdowns',
                            generateGif && 'GIFs', 
                            generateThumbnails && 'Thumbnails',
                            generateCanvas && 'Spotify Canvas'
                          ].filter(Boolean).join(' & ')
                        }
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Timestamp Input (only show if cutdowns enabled) */}
          {generateCutdowns && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="text-brand-green mr-2" />
                  2. Add Timestamps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TimestampInput
                  videoId={uploadedVideo?.id}
                  timestampText={timestampText}
                  setTimestampText={setTimestampText}
                  onTimestampsParsed={handleTimestampsParsed}
                />
                {(timestamps.length > 0 || errors.length > 0 || warnings.length > 0) && (
                  <div className="mt-6">
                    <TimestampPreview
                      timestamps={timestamps}
                      setTimestamps={setTimestamps}
                      errors={errors}
                      warnings={warnings}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Download */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Download className="text-brand-green mr-2" />
                3. Generate & Download
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProcessingControls
                video={uploadedVideo}
                timestampText={timestampText}
                onProcessingComplete={handleProcessingComplete}
                generateCutdowns={generateCutdowns}
                generateGif={generateGif}
                generateThumbnails={generateThumbnails}
                generateCanvas={generateCanvas}
                aspectRatios={aspectRatios}
                onAspectRatiosChange={setAspectRatios}
              />
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-brand-black border-t border-gray-800 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="flex items-center text-gray-300">
              <span className="text-sm">Powered by</span>
              <img src={fdLogo} alt="Full Digital" className="h-6 w-6 mx-2" />
              <a 
                href="https://www.fulldigitalll.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-brand-green hover:text-brand-green-light transition-colors text-sm font-medium"
              >
                Full Digital
              </a>
            </div>
          </div>
          <div className="text-center mt-2">
            <p className="text-xs text-gray-400">
              Multi-Platinum Design Agency - Artwork, Animation, AR Filters, Visualizers, Websites & More
            </p>
            <p className="text-xs text-gray-500 mt-1 border-t border-gray-800 pt-2">
              By using this tool, you agree to our{" "}
              <a href="/terms" className="text-brand-green hover:text-brand-green-light underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-brand-green hover:text-brand-green-light underline">
                Privacy Policy
              </a>
              . All rights reserved © 2025 Full Digital LLC.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
