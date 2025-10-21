import { useState } from "react";
import { Info, Shuffle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Timestamp } from "@shared/schema";

interface TimestampInputProps {
  videoId?: number;
  timestampText: string;
  setTimestampText: (text: string) => void;
  onTimestampsParsed: (data: { timestamps: Timestamp[]; errors: string[]; warnings: string[] }) => void;
}

export default function TimestampInput({
  videoId,
  timestampText,
  setTimestampText,
  onTimestampsParsed,
}: TimestampInputProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleParseTimestamps = async () => {
    if (!videoId) {
      toast({
        title: "No video uploaded",
        description: "Please upload a video first.",
        variant: "destructive",
      });
      return;
    }

    if (!timestampText.trim()) {
      toast({
        title: "No timestamps provided",
        description: "Please enter timestamps to parse.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await apiRequest('POST', '/api/parse-timestamps', {
        text: timestampText,
        videoId,
      });
      
      const data = await response.json();
      onTimestampsParsed(data);
      
      if (data.timestamps.length > 0) {
        toast({
          title: "Timestamps parsed successfully",
          description: `Found ${data.timestamps.length} valid timestamp${data.timestamps.length !== 1 ? 's' : ''}.`,
        });
      }
      
      if (data.errors.length > 0) {
        toast({
          title: "Some timestamps couldn't be parsed",
          description: `${data.errors.length} error${data.errors.length !== 1 ? 's' : ''} found.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: "Parsing failed",
        description: "Failed to parse timestamps. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate5Cuts = async () => {
    if (!videoId) {
      toast({
        title: "No video uploaded",
        description: "Please upload a video first.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await apiRequest('POST', '/api/generate-5-cuts', {
        videoId,
      });
      
      const data = await response.json();
      
      if (data.timestamps && data.timestamps.length > 0) {
        // Convert to text format and set it
        const timestampLines = data.timestamps.map((ts: Timestamp) => 
          `${ts.startTime} - ${ts.endTime}`
        ).join('\n');
        
        setTimestampText(timestampLines);
        onTimestampsParsed({
          timestamps: data.timestamps,
          errors: data.errors || [],
          warnings: data.warnings || []
        });
        
        toast({
          title: "Clips generated!",
          description: `Generated ${data.timestamps.length} clips optimized for your video length.`,
        });
      } else {
        toast({
          title: "Generation failed",
          description: data.message || "Could not generate clips. Video may be too short.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Generate clips error:', error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate clips. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Auto 5-Cut Generator */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="font-medium text-gray-800">Quick Start</h3>
                <p className="text-sm text-gray-600">Auto-generate clips based on video length</p>
              </div>
            </div>
            <Button
              onClick={handleGenerate5Cuts}
              disabled={!videoId || isProcessing}
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <Shuffle className="w-4 h-4 mr-2" />
              Auto Generate
            </Button>
          </div>
        </div>

        {/* Timestamp Input with Info Icon */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Timestamp Format
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">Supports various formats (: ; .) and separators (- – ,)</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Textarea
            value={timestampText}
            onChange={(e) => setTimestampText(e.target.value)}
            className="w-full h-32 resize-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
            placeholder={`Enter timestamps, one per line:
0:16-0:35
0:44-1:01
1:01-1:19

Or use "Auto Generate" above for quick start!`}
          />
        </div>

        {/* Parse Button */}
        <Button
          onClick={handleParseTimestamps}
          disabled={!videoId || !timestampText.trim() || isProcessing}
          className="w-full bg-brand-green text-white hover:bg-brand-green-dark"
        >
          {isProcessing ? "Processing..." : "Parse Timestamps"}
        </Button>
      </div>
    </TooltipProvider>
  );
}
