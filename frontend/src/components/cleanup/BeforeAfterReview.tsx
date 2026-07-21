import { useState, useCallback } from 'react';
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from 'react-compare-slider';
import {
  Maximize,
  RotateCcw,
  Download,
  X,
  RotateCcw as RetryIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface BeforeAfterReviewProps {
  original: string;
  cleaned: string;
  onDownload: () => void;
  onReject: () => void;
  onRetry: (lowerStrength: boolean) => void;
}

export default function BeforeAfterReview({
  original,
  cleaned,
  onDownload,
  onReject,
  onRetry,
}: BeforeAfterReviewProps) {
  const [fitToWindow, setFitToWindow] = useState(true);
  const [actualPixels, setActualPixels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sliderPosition, setSliderPosition] = useState(50);

  const handleReset = useCallback(() => {
    setFitToWindow(true);
    setActualPixels(false);
    setZoom(1);
    setSliderPosition(50);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 4));
    setFitToWindow(false);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleFitToWindow = useCallback(() => {
    setFitToWindow(true);
    setActualPixels(false);
    setZoom(1);
  }, []);

  const handleActualPixels = useCallback(() => {
    setActualPixels((prev) => !prev);
    setFitToWindow(false);
    setZoom(actualPixels ? 1 : 2);
  }, [actualPixels]);

  const objectFit = fitToWindow ? 'contain' : actualPixels ? 'none' : 'contain';

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Labels row */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-[0.08em] text-[#5e6a7e] font-medium">
          Original
        </span>
        <span className="text-xs uppercase tracking-[0.08em] text-[#5e6a7e] font-medium">
          Cleaned
        </span>
      </div>

      {/* Compare slider container */}
      <div
        className="relative w-full rounded-lg border border-[#2A2E39] overflow-hidden"
        style={{
          background: 'repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, #0d1016 0% 50%) 0 0 / 20px 20px',
          minHeight: 400,
          maxHeight: 'calc(100vh - 320px)',
        }}
      >
        <ReactCompareSlider
          defaultPosition={sliderPosition}
          onPositionChange={setSliderPosition}
          style={{ width: '100%', height: '100%', minHeight: 400 }}
          itemOne={
            <ReactCompareSliderImage
              src={original}
              alt="Original scan"
              style={{
                objectFit,
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: 'center center',
                transition: 'transform 150ms ease',
                width: '100%',
                height: '100%',
              }}
            />
          }
          itemTwo={
            <ReactCompareSliderImage
              src={cleaned}
              alt="Cleaned scan"
              style={{
                objectFit,
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: 'center center',
                transition: 'transform 150ms ease',
                width: '100%',
                height: '100%',
              }}
            />
          }
        />
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* View controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFitToWindow}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
              fitToWindow
                ? 'bg-[#1e2330] text-[#e8eaf0] border border-[#3a4055]'
                : 'text-[#94a3b8] hover:bg-[#1a1e27] border border-transparent'
            }`}
            aria-label="Fit to window"
            title="Fit to window"
          >
            <Maximize className="size-3.5" strokeWidth={1.5} />
            Fit
          </button>
          <button
            onClick={handleActualPixels}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
              actualPixels
                ? 'bg-[#1e2330] text-[#e8eaf0] border border-[#3a4055]'
                : 'text-[#94a3b8] hover:bg-[#1a1e27] border border-transparent'
            }`}
            aria-label="Toggle actual pixel view"
            title="Actual pixels"
          >
            100%
          </button>
          <button
            onClick={handleZoomIn}
            className="inline-flex items-center justify-center size-7 rounded-sm text-[#94a3b8] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors border border-transparent"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn className="size-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={handleZoomOut}
            className="inline-flex items-center justify-center size-7 rounded-sm text-[#94a3b8] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors border border-transparent"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="size-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-[#94a3b8] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors border border-transparent"
            aria-label="Reset view"
            title="Reset view"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.5} />
            Reset
          </button>
          {zoom !== 1 && (
            <span className="text-xs text-[#5e6a7e] ml-1">
              {Math.round(zoom * 100)}%
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRetry(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-[#94a3b8] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors border border-[#2A2E39]"
            aria-label="Retry with lower strength"
            title="Retry with lower strength"
          >
            <RetryIcon className="size-3.5" strokeWidth={1.5} />
            Retry Lower
          </button>
          <button
            onClick={onReject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] transition-colors border border-[rgba(239,68,68,0.2)]"
            aria-label="Reject cleaned result"
            title="Reject"
          >
            <X className="size-3.5" strokeWidth={1.5} />
            Reject
          </button>
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-white transition-all border-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
            aria-label="Download cleaned image"
            title="Download"
          >
            <Download className="size-3.5" strokeWidth={1.5} />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
