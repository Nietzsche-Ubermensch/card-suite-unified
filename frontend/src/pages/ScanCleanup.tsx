import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scan,
  Upload,
  Search,
  Sparkles,
  X,
  RectangleVertical,
  RectangleHorizontal,
  HelpCircle,
  Zap,
  CircleHelp,
  Loader2,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Image,
  ArrowLeftRight,
} from 'lucide-react';
import { readVeniceStatusFromHeaders, API_ENDPOINTS } from '@/lib/api-client';
import { useModelSelection } from '@/hooks/useModelSelection';
import { addCompareItem, notifyCompareListChanged } from '@/lib/compare-store';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MaterialType,
  Orientation,
  ScanAnalysisResult,
} from '@/types';
import ScanDropzone from '@/components/cleanup/ScanDropzone';
import BeforeAfterReview from '@/components/cleanup/BeforeAfterReview';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URI prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMaterialIcon(material: MaterialType) {
  switch (material) {
    case 'cardboard':
      return <RectangleVertical className="size-3" strokeWidth={1.5} />;
    case 'chrome':
      return <Sparkles className="size-3" strokeWidth={1.5} />;
    case 'refractor':
      return <Zap className="size-3" strokeWidth={1.5} />;
    default:
      return <HelpCircle className="size-3" strokeWidth={1.5} />;
  }
}

function getMaterialLabel(material: MaterialType) {
  return material.charAt(0).toUpperCase() + material.slice(1);
}

function getOrientationIcon(orientation: Orientation) {
  if (orientation === 'horizontal') {
    return <RectangleHorizontal className="size-3" strokeWidth={1.5} />;
  }
  if (orientation === 'vertical') {
    return <RectangleVertical className="size-3" strokeWidth={1.5} />;
  }
  return <HelpCircle className="size-3" strokeWidth={1.5} />;
}

function getOrientationLabel(orientation: Orientation) {
  if (orientation === 'horizontal') return 'Horizontal';
  if (orientation === 'vertical') return 'Vertical';
  return 'Unknown';
}

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export default function ScanCleanup() {
  const { selected } = useModelSelection();

  // Core state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [material, setMaterial] = useState<MaterialType>('unknown');
  const [orientation, setOrientation] = useState<Orientation>('unknown');
  const [analysis, setAnalysis] = useState<ScanAnalysisResult | null>(null);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [strength, setStrength] = useState(0.45);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showComparison, setShowComparison] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<boolean>(false);

  // Auto-scroll log
  useEffect(() => {
    if (logOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logEntries, logOpen]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (cleanedUrl) URL.revokeObjectURL(cleanedUrl);
    };
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      message,
      type,
    };
    setLogEntries((prev) => [...prev, entry]);
  }, []);

  const handleFileDrop = useCallback(
    (droppedFile: File) => {
      // Clear previous state
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (cleanedUrl) URL.revokeObjectURL(cleanedUrl);

      const url = URL.createObjectURL(droppedFile);
      setFile(droppedFile);
      setPreviewUrl(url);
      setMaterial('unknown');
      setOrientation('unknown');
      setAnalysis(null);
      setCleanedUrl(null);
      setShowComparison(false);
      setError(null);
      setStrength(0.45);
      setLogEntries([]);
      addLog(`Upload: ${droppedFile.name} (${(droppedFile.size / (1024 * 1024)).toFixed(1)}MB)`, 'info');
    },
    [previewUrl, cleanedUrl, addLog],
  );

  const handleCancel = useCallback(() => {
    abortRef.current = true;
    setIsAnalyzing(false);
    setIsCleaning(false);
    addLog('Operation cancelled by user', 'warning');
  }, [addLog]);

  const handleAnalyze = useCallback(async () => {
    if (!file || !previewUrl) return;

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setCleanedUrl(null);
    setShowComparison(false);
    abortRef.current = false;
    addLog('Analysis started...', 'info');

    try {
      const imageBase64 = await fileToBase64(file);
      const model = selected.analysis || 'default';

      const response = await fetch(API_ENDPOINTS.analyze, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          model,
          filename: file.name,
        }),
      });

      if (abortRef.current) return;

      // Read Venice status headers
      const veniceStatus = readVeniceStatusFromHeaders(response.headers);
      if (veniceStatus.remainingRequests) {
        console.log('[Venice] Remaining requests:', veniceStatus.remainingRequests);
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `Analysis failed: HTTP ${response.status}`);
      }

      const result = await response.json();
      const analysisResult: ScanAnalysisResult = result.analysis ?? result;

      setAnalysis(analysisResult);

      // Update material/orientation from analysis
      if (analysisResult.material) {
        setMaterial(analysisResult.material);
      }
      if (analysisResult.orientation) {
        setOrientation(analysisResult.orientation);
      }

      addLog(
        `Analysis complete: ${analysisResult.artifactTypes?.length ?? 0} artifacts detected`,
        'success',
      );
    } catch (err) {
      if (abortRef.current) return;
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      addLog(`Analysis error: ${msg}`, 'error');
    } finally {
      if (!abortRef.current) {
        setIsAnalyzing(false);
      }
    }
  }, [file, previewUrl, selected.analysis, addLog]);

  const handleClean = useCallback(async () => {
    if (!file || !previewUrl) return;

    setIsCleaning(true);
    setError(null);
    setShowComparison(false);
    abortRef.current = false;
    addLog('Cleaning started...', 'info');

    try {
      const imageBase64 = await fileToBase64(file);
      const model = selected.restore || selected.analysis || 'default';

      const response = await fetch(API_ENDPOINTS.scanCleanup, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          model,
          filename: file.name,
          strength,
          material,
          orientation,
        }),
      });

      if (abortRef.current) return;

      // Read Venice status headers
      const veniceStatus = readVeniceStatusFromHeaders(response.headers);
      if (veniceStatus.remainingRequests) {
        console.log('[Venice] Remaining requests:', veniceStatus.remainingRequests);
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `Cleanup failed: HTTP ${response.status}`);
      }

      const result = await response.json();

      // The cleaned image could be a data URL or a URL string
      let newCleanedUrl: string | null = null;
      if (result.cleanedImage) {
        if (typeof result.cleanedImage === 'string') {
          newCleanedUrl = result.cleanedImage.startsWith('data:')
            ? result.cleanedImage
            : `data:image/png;base64,${result.cleanedImage}`;
        }
      } else if (result.image) {
        newCleanedUrl = typeof result.image === 'string'
          ? (result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`)
          : null;
      } else if (typeof result === 'string') {
        newCleanedUrl = result.startsWith('data:') ? result : `data:image/png;base64,${result}`;
      }

      if (newCleanedUrl) {
        setCleanedUrl(newCleanedUrl);
        setShowComparison(true);
        addLog('Cleaning complete', 'success');
      } else {
        throw new Error('No cleaned image returned from server');
      }
    } catch (err) {
      if (abortRef.current) return;
      const msg = err instanceof Error ? err.message : 'Cleanup failed';
      setError(msg);
      addLog(`Cleanup error: ${msg}`, 'error');
    } finally {
      if (!abortRef.current) {
        setIsCleaning(false);
      }
    }
  }, [file, previewUrl, strength, material, orientation, selected, addLog]);

  const handleDownload = useCallback(() => {
    if (!cleanedUrl) return;
    const link = document.createElement('a');
    link.href = cleanedUrl;
    link.download = file ? file.name.replace(/\.[^/.]+$/, '_clean.png') : 'cleaned.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog('Cleaned image downloaded', 'success');
  }, [cleanedUrl, file, addLog]);

  const handleReject = useCallback(() => {
    setShowComparison(false);
    setCleanedUrl(null);
    addLog('Result rejected', 'warning');
  }, [addLog]);

  const handleRetry = useCallback(
    (lowerStrength: boolean) => {
      if (lowerStrength) {
        setStrength((prev) => Math.max(prev - 0.15, 0.05));
      }
      setShowComparison(false);
      setCleanedUrl(null);
      // Auto-trigger clean after brief delay
      setTimeout(() => {
        handleClean();
      }, 100);
    },
    [handleClean],
  );

  const handleUploadNew = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (cleanedUrl) URL.revokeObjectURL(cleanedUrl);
    setFile(null);
    setPreviewUrl(null);
    setMaterial('unknown');
    setOrientation('unknown');
    setAnalysis(null);
    setCleanedUrl(null);
    setShowComparison(false);
    setError(null);
    setStrength(0.45);
    setLogEntries([]);
  }, [previewUrl, cleanedUrl]);

  const handleSaveToCompare = useCallback(() => {
    if (!file || !previewUrl || !cleanedUrl) return;
    addCompareItem({
      original: previewUrl,
      cleaned: cleanedUrl,
      filename: file.name,
      strength,
      material,
      orientation,
    });
    notifyCompareListChanged();
    addLog('Saved to compare list', 'success');
  }, [file, previewUrl, cleanedUrl, strength, material, orientation, addLog]);

  const isBusy = isAnalyzing || isCleaning;
  const hasImage = !!file && !!previewUrl;
  const canAnalyze = hasImage && !isBusy;
  const canClean = hasImage && !!analysis && !isBusy;
  const canCompare = hasImage && !!cleanedUrl;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-[1440px] mx-auto">
        {/* Page title row */}
        <div className="flex items-center justify-between pb-5 mb-6 border-b border-[#1e2230]">
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#e8eaf0]">
            Scan Cleanup
          </h1>
          <div className="flex items-center gap-3">
            {hasImage && (
              <button
                onClick={handleUploadNew}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-[#e8eaf0] border border-[#2A2E39] hover:bg-[#1a1e27] hover:border-[#3a4055] transition-colors"
                aria-label="Upload new scan"
              >
                <Upload className="size-4" strokeWidth={1.5} />
                Upload New
              </button>
            )}
            <button
              className="inline-flex items-center justify-center size-8 rounded-sm text-[#94a3b8] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors"
              aria-label="Get help"
              title="Get help"
            >
              <CircleHelp className="size-[18px]" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-md bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#ef4444]">
            <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} />
            <p className="text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto shrink-0 text-[#94a3b8] hover:text-[#e8eaf0]"
              aria-label="Dismiss error"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left column: dropzone / image / comparison */}
          <div className="space-y-4">
            {!hasImage ? (
              <div className="max-w-[600px] mx-auto">
                <ScanDropzone onFileDrop={handleFileDrop} disabled={false} />
              </div>
            ) : showComparison && cleanedUrl ? (
              <BeforeAfterReview
                original={previewUrl}
                cleaned={cleanedUrl}
                onDownload={handleDownload}
                onReject={handleReject}
                onRetry={handleRetry}
              />
            ) : (
              <div className="space-y-3">
                {/* Image preview frame */}
                <div
                  className="relative w-full rounded-lg border border-[#2A2E39] overflow-hidden"
                  style={{
                    background:
                      'repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, #0d1016 0% 50%) 0 0 / 20px 20px',
                    maxHeight: 600,
                  }}
                >
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]">
                      {getMaterialIcon(material)}
                      {getMaterialLabel(material)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]">
                      {getOrientationIcon(orientation)}
                      {getOrientationLabel(orientation)}
                    </span>
                  </div>

                  {/* Image */}
                  <img
                    src={previewUrl}
                    alt={`Preview of ${file?.name}`}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: 600 }}
                  />

                  {/* Analyzing overlay */}
                  {isAnalyzing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(0,0,0,0.5)] z-20">
                      <Loader2 className="size-8 text-[#6366f1] animate-spin" strokeWidth={1.5} />
                      <p className="mt-3 text-sm text-[#e8eaf0] font-medium">Analyzing...</p>
                    </div>
                  )}

                  {/* Cleaning overlay */}
                  {isCleaning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(0,0,0,0.5)] z-20">
                      <div
                        className="size-8 rounded-full animate-pulse"
                        style={{
                          background: 'linear-gradient(90deg, #06b6d4, #6366f1)',
                        }}
                      />
                      <p className="mt-3 text-sm text-[#e8eaf0] font-medium">Cleaning...</p>
                    </div>
                  )}
                </div>

                {/* Filename */}
                <p className="text-xs text-[#5e6a7e] text-center truncate">
                  {file?.name} ({file ? (file.size / (1024 * 1024)).toFixed(1) : 0} MB)
                </p>
              </div>
            )}

            {/* Processing log */}
            {logEntries.length > 0 && (
              <div className="mt-4 border border-[#2A2E39] rounded-lg overflow-hidden">
                <button
                  onClick={() => setLogOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[#94a3b8] hover:bg-[#1a1e27] transition-colors"
                  aria-label="Toggle processing log"
                >
                  <span className="flex items-center gap-2">
                    <Activity className="size-3.5" strokeWidth={1.5} />
                    Processing Log ({logEntries.length})
                  </span>
                  <span
                    className={`transform transition-transform duration-200 ${logOpen ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </button>
                {logOpen && (
                  <div className="max-h-40 overflow-y-auto px-4 py-2 space-y-1 bg-[#0d1016]">
                    {logEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="text-xs font-mono text-[#94a3b8] border-l-2 pl-2 py-0.5"
                        style={{
                          borderLeftColor:
                            entry.type === 'success'
                              ? '#10b981'
                              : entry.type === 'warning'
                                ? '#f59e0b'
                                : entry.type === 'error'
                                  ? '#ef4444'
                                  : '#6366f1',
                        }}
                      >
                        <span className="text-[#5e6a7e]">[{entry.timestamp}]</span>{' '}
                        {entry.message}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column: controls */}
          <div className="space-y-6">
            {/* Configuration section */}
            <div className="bg-[#12151c] border border-[#2A2E39] rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-[#94a3b8]">Configuration</h3>

              {/* Material selector */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#94a3b8]">Material Type</label>
                <Select
                  value={material}
                  onValueChange={(v) => setMaterial(v as MaterialType)}
                  disabled={!hasImage || isBusy}
                >
                  <SelectTrigger className="w-full bg-[#0d1016] border-[#2A2E39] text-[#e8eaf0] h-9">
                    <SelectValue placeholder="Unknown (Auto-Detect)" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#12151c] border-[#2A2E39]">
                    <SelectItem value="unknown" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <HelpCircle className="size-3.5" strokeWidth={1.5} />
                        Unknown (Auto-Detect)
                      </span>
                    </SelectItem>
                    <SelectItem value="cardboard" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <RectangleVertical className="size-3.5" strokeWidth={1.5} />
                        Cardboard
                      </span>
                    </SelectItem>
                    <SelectItem value="chrome" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <Sparkles className="size-3.5" strokeWidth={1.5} />
                        Chrome
                      </span>
                    </SelectItem>
                    <SelectItem value="refractor" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <Zap className="size-3.5" strokeWidth={1.5} />
                        Refractor
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Orientation selector */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#94a3b8]">Orientation</label>
                <Select
                  value={orientation}
                  onValueChange={(v) => setOrientation(v as Orientation)}
                  disabled={!hasImage || isBusy}
                >
                  <SelectTrigger className="w-full bg-[#0d1016] border-[#2A2E39] text-[#e8eaf0] h-9">
                    <SelectValue placeholder="Unknown (Auto-Detect)" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#12151c] border-[#2A2E39]">
                    <SelectItem value="unknown" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <HelpCircle className="size-3.5" strokeWidth={1.5} />
                        Unknown (Auto-Detect)
                      </span>
                    </SelectItem>
                    <SelectItem value="vertical" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <RectangleVertical className="size-3.5" strokeWidth={1.5} />
                        Vertical (Portrait)
                      </span>
                    </SelectItem>
                    <SelectItem value="horizontal" className="text-[#e8eaf0] focus:bg-[#1e2330] focus:text-[#e8eaf0]">
                      <span className="flex items-center gap-2">
                        <RectangleHorizontal className="size-3.5" strokeWidth={1.5} />
                        Horizontal (Landscape)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Analysis results */}
            {analysis && (
              <div className="bg-[#12151c] border border-[#2A2E39] rounded-lg p-4 space-y-3">
                <h3 className="text-[15px] font-semibold text-[#e8eaf0] flex items-center gap-2">
                  <Activity className="size-4" strokeWidth={1.5} />
                  Analysis Results
                </h3>
                <div className="h-px bg-[#1e2230]" />

                {/* Artifacts list */}
                <div className="space-y-2">
                  {analysis.artifactTypes?.map((artifact, i) => (
                    <div
                      key={`${artifact}-${i}`}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-sm text-[#e8eaf0]">{artifact}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          artifact.includes('High')
                            ? 'bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)]'
                            : artifact.includes('Moderate')
                              ? 'bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]'
                              : 'bg-[rgba(16,185,129,0.1)] text-[#10b981] border border-[rgba(16,185,129,0.2)]'
                        }`}
                      >
                        {artifact.includes('High')
                          ? 'High'
                          : artifact.includes('Moderate')
                            ? 'Moderate'
                            : 'Slight'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Color cast */}
                {analysis.colorCast && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-[#94a3b8]">Color Cast</span>
                    <span className="text-sm text-[#e8eaf0]">{analysis.colorCast}</span>
                  </div>
                )}

                {/* Lighting issues */}
                {analysis.lightingIssues && analysis.lightingIssues.length > 0 && (
                  <div className="py-1">
                    <span className="text-sm text-[#94a3b8]">Lighting Issues</span>
                    <ul className="mt-1 space-y-0.5">
                      {analysis.lightingIssues.map((issue, i) => (
                        <li key={i} className="text-sm text-[#e8eaf0]">
                          • {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Card condition */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-[#94a3b8]">Card Condition</span>
                  <span
                    className={`inline-flex items-center gap-1 text-sm ${
                      analysis.cardConditionIntact ? 'text-[#10b981]' : 'text-[#ef4444]'
                    }`}
                  >
                    {analysis.cardConditionIntact ? (
                      <>
                        <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                        Intact
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-3.5" strokeWidth={1.5} />
                        Affected
                      </>
                    )}
                  </span>
                </div>

                {/* Confidence */}
                {analysis.confidence !== undefined && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#94a3b8]">Confidence</span>
                      <span className="text-sm font-medium text-[#818cf8]">
                        {Math.round(analysis.confidence * 100)}%
                      </span>
                    </div>
                    <div className="h-1 w-full bg-[#0d1016] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(analysis.confidence * 100)}%`,
                          background:
                            analysis.confidence > 0.8
                              ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : analysis.confidence > 0.5
                                ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                : 'linear-gradient(90deg, #ef4444, #f87171)',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Recommended approach */}
                {analysis.recommendedApproach && (
                  <p className="text-xs text-[#94a3b8] pt-1">
                    Recommended: {analysis.recommendedApproach}
                  </p>
                )}
              </div>
            )}

            {/* Strength slider */}
            <div className="bg-[#12151c] border border-[#2A2E39] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#94a3b8]">Cleanup Strength</label>
                <span className="text-sm font-medium text-[#818cf8]">
                  {Math.round(strength * 100)}%
                </span>
              </div>
              <Slider
                value={[strength * 100]}
                onValueChange={(vals) => setStrength(vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                disabled={!hasImage || isBusy}
              />
            </div>

            {/* Action buttons */}
            <div className="bg-[#12151c] border border-[#2A2E39] rounded-lg p-4 space-y-2.5">
              {/* Primary actions */}
              <div className="flex items-center gap-2">
                {isAnalyzing ? (
                  <button
                    onClick={handleCancel}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.1)] transition-colors"
                    aria-label="Cancel analysis"
                  >
                    <X className="size-4" strokeWidth={1.5} />
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleAnalyze}
                    disabled={!canAnalyze}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background:
                        canAnalyze
                          ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                          : '#2A2E39',
                    }}
                    onMouseEnter={(e) => {
                      if (canAnalyze) e.currentTarget.style.filter = 'brightness(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      if (canAnalyze) e.currentTarget.style.filter = 'brightness(1)';
                    }}
                    aria-label="Analyze scan"
                  >
                    <Search className="size-4" strokeWidth={1.5} />
                    Analyze
                  </button>
                )}

                {isCleaning ? (
                  <button
                    onClick={handleCancel}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.1)] transition-colors"
                    aria-label="Cancel cleaning"
                  >
                    <X className="size-4" strokeWidth={1.5} />
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleClean}
                    disabled={!canClean}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background:
                        canClean
                          ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                          : '#2A2E39',
                    }}
                    onMouseEnter={(e) => {
                      if (canClean) e.currentTarget.style.filter = 'brightness(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      if (canClean) e.currentTarget.style.filter = 'brightness(1)';
                    }}
                    aria-label="Clean scan"
                  >
                    <Sparkles className="size-4" strokeWidth={1.5} />
                    Clean
                  </button>
                )}
              </div>

              {/* Secondary actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowComparison((prev) => !prev)}
                  disabled={!canCompare}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm text-[#e8eaf0] border border-[#2A2E39] hover:bg-[#1a1e27] hover:border-[#3a4055] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Toggle comparison view"
                >
                  <Scan className="size-4" strokeWidth={1.5} />
                  Compare
                </button>
                <button
                  onClick={handleSaveToCompare}
                  disabled={!cleanedUrl}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm text-[#e8eaf0] border border-[#2A2E39] hover:bg-[#1a1e27] hover:border-[#3a4055] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Save to compare list"
                >
                  <ArrowLeftRight className="size-4" strokeWidth={1.5} />
                  Save
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!cleanedUrl}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm text-[#e8eaf0] border border-[#2A2E39] hover:bg-[#1a1e27] hover:border-[#3a4055] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Download cleaned image"
                >
                  <Upload className="size-4" strokeWidth={1.5} />
                  Download
                </button>
              </div>
            </div>

            {/* Upload new button (mobile, below controls) */}
            {hasImage && (
              <button
                onClick={handleUploadNew}
                className="w-full lg:hidden inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm text-[#94a3b8] border border-[#2A2E39] hover:bg-[#1a1e27] hover:text-[#e8eaf0] transition-colors"
                aria-label="Upload new scan"
              >
                <Image className="size-4" strokeWidth={1.5} />
                Upload New Scan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
