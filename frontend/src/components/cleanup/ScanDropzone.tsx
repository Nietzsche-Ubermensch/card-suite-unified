import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import { Image, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScanDropzoneProps {
  onFileDrop: (file: File) => void;
  disabled?: boolean;
}

type DropzoneState = 'default' | 'drag-over' | 'error' | 'success';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function ScanDropzone({ onFileDrop, disabled = false }: ScanDropzoneProps) {
  const [state, setState] = useState<DropzoneState>('default');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clear success state after flash
  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => setState('default'), 800);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Clear error state after shake
  useEffect(() => {
    if (state === 'error') {
      const timer = setTimeout(() => {
        setState('default');
        setErrorMsg(null);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        if (rejection.file.size > MAX_FILE_SIZE) {
          setErrorMsg('File exceeds 20MB limit');
        } else {
          setErrorMsg('Invalid file type. Please upload an image.');
        }
        setState('error');
        return;
      }

      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      if (file.size > MAX_FILE_SIZE) {
        setErrorMsg('File exceeds 20MB limit');
        setState('error');
        return;
      }

      setState('success');
      onFileDrop(file);
    },
    [onFileDrop],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    noClick: false,
    noKeyboard: false,
    disabled,
    multiple: false,
  });

  // Sync drag-active state with our visual state
  useEffect(() => {
    if (isDragActive) {
      setState('drag-over');
    } else if (state === 'drag-over') {
      setState('default');
    }
  }, [isDragActive]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  return (
    <div
      {...getRootProps()}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop your card scan image here, or press Enter to browse files"
      className={cn(
        'w-full min-h-[400px] flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer select-none',
        'bg-[#131821] border-[#2A2E39]',
        state === 'drag-over' && 'border-[#6366f1] bg-[#1a2030] shadow-[0_0_8px_rgba(99,102,241,0.15)]',
        state === 'error' && 'border-[#ef4444]',
        state === 'success' && 'border-[#10b981]',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
      style={
        state === 'error'
          ? { animation: 'shake 0.3s ease-in-out' }
          : undefined
      }
    >
      <input {...getInputProps()} />

      {/* Shake animation keyframe - scoped to this component via inline style approach */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>

      <div className="flex flex-col items-center gap-4 px-6 text-center">
        {/* Icon */}
        {state === 'error' ? (
          <Image
            className={cn(
              'size-12 transition-colors duration-200',
              state === 'error' ? 'text-[#ef4444]' : 'text-[#5e6a7e]',
            )}
            strokeWidth={1.5}
          />
        ) : (
          <Upload
            className={cn(
              'size-12 transition-colors duration-200',
              state === 'drag-over' && 'text-[#6366f1]',
              state === 'success' && 'text-[#10b981]',
              state === 'default' && 'text-[#5e6a7e]',
            )}
            strokeWidth={1.5}
          />
        )}

        {/* Primary text */}
        <p className="text-lg font-semibold text-[#e8eaf0]">
          {state === 'error' ? 'Upload failed' : 'Drop your card scan here'}
        </p>

        {/* Secondary text */}
        <p className="text-sm text-[#5e6a7e]">
          {errorMsg ?? 'or click to browse — JPG, PNG, TIFF up to 20MB'}
        </p>

        {/* File format badges */}
        <div className="flex items-center gap-2 mt-2">
          {['JPG', 'PNG', 'TIFF', 'WEBP'].map((fmt) => (
            <span
              key={fmt}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.2)]"
            >
              {fmt}
            </span>
          ))}
        </div>

        {/* File size limit */}
        <p className="text-xs text-[#5e6a7e] mt-1">Max 20MB per file</p>
      </div>
    </div>
  );
}
