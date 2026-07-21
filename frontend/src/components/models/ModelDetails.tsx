import { useState } from 'react';
import {
  Eye,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  Coins,
  Image,
  Maximize,
  Sparkles,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { VeniceModel } from '@/types';

interface ModelDetailsProps {
  model: VeniceModel;
}

function getFriendlyModelName(model: VeniceModel): string {
  return model.name || model.id;
}

function formatPrice(model: VeniceModel): string {
  if (!model.pricing) return 'Free';
  if (model.pricing.prompt === 0 && model.pricing.completion === 0) return 'Free';
  const parts: string[] = [];
  if (model.pricing.prompt !== undefined) {
    parts.push(`$${model.pricing.prompt.toFixed(6)}/prompt tok`);
  }
  if (model.pricing.completion !== undefined) {
    parts.push(`$${model.pricing.completion.toFixed(6)}/completion tok`);
  }
  if (model.pricing.image !== undefined) {
    parts.push(`$${model.pricing.image.toFixed(4)}/image`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Free';
}

const typeBadgeColors: Record<string, string> = {
  text: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  image: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  inpaint: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  edit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  upscale: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

export default function ModelDetails({ model }: ModelDetailsProps) {
  const [copied, setCopied] = useState(false);

  const hasVision =
    model.capabilities?.supportsVision === true ||
    model.capabilities?.supports_vision === true ||
    model.capabilities?.vision === true;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(model.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Build capabilities list
  const capabilities: string[] = [];
  if (hasVision) capabilities.push('Vision');
  if (model.capabilities?.supportsImageGeneration) capabilities.push('Image Generation');
  const specCaps = model.model_spec?.capabilities;
  if (specCaps && typeof specCaps === 'object') {
    Object.entries(specCaps).forEach(([key, val]) => {
      if (val === true && !key.toLowerCase().includes('vision')) {
        capabilities.push(key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()));
      }
    });
  }

  const typeLabel = (model.type || 'text').toLowerCase();

  return (
    <div className="bg-[#1e2330] border-t border-[#1e2230] p-5 animate-in slide-in-from-top-1 duration-200">
      {/* Deprecation warning */}
      {model.is_deprecated && (
        <div className="flex items-start gap-2.5 p-3 mb-4 rounded-sm bg-amber-500/10 border border-status-warning text-sm text-status-warning">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Deprecated Model</p>
            {model.deprecation_warning && (
              <p className="text-xs mt-0.5 opacity-80">{model.deprecation_warning}</p>
            )}
            {model.deprecation_date && (
              <p className="text-xs mt-0.5 opacity-80">Date: {model.deprecation_date}</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-text-primary">
              {getFriendlyModelName(model)}
            </h3>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0 h-5 font-medium capitalize',
                typeBadgeColors[typeLabel] || typeBadgeColors.text
              )}
            >
              {model.type || 'text'}
            </Badge>
            {model.is_beta && (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 h-5 font-medium bg-status-info/10 text-status-info border-status-info/20"
              >
                Beta
              </Badge>
            )}
            {model.uncensored && (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 h-5 font-medium bg-purple-500/10 text-purple-400 border-purple-500/20"
              >
                Uncensored
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="text-xs text-text-tertiary font-mono">{model.id}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-text-tertiary hover:text-text-primary"
              onClick={handleCopyId}
              aria-label="Copy model ID"
            >
              {copied ? (
                <Check className="size-3 text-status-success" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={cn(
              'size-2 rounded-full',
              model.is_deprecated ? 'bg-status-warning' : 'bg-status-success'
            )}
          />
          <span className="text-xs text-text-secondary">
            {model.is_deprecated ? 'Deprecated' : 'Online'}
          </span>
        </div>
      </div>

      {/* Description */}
      {model.description && (
        <p className="text-sm text-text-secondary mb-3 leading-relaxed">
          {model.description}
        </p>
      )}

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="size-3.5 text-status-info" />
            <span className="text-xs font-medium text-text-secondary uppercase tracking-[0.04em]">
              Capabilities
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((cap) => (
              <Badge
                key={cap}
                variant="outline"
                className="text-[10px] px-2 py-0.5 h-5 font-medium bg-status-info/10 text-status-info border-status-info/20"
              >
                {cap}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Specs Grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-4">
        {/* Vision */}
        <div className="flex items-center gap-2">
          <Eye className={cn('size-3.5', hasVision ? 'text-status-success' : 'text-text-disabled')} />
          <div>
            <p className="text-[11px] text-text-tertiary">Vision Support</p>
            <p className={cn('text-sm font-medium', hasVision ? 'text-status-success' : 'text-text-disabled')}>
              {hasVision ? 'Yes' : 'No'}
            </p>
          </div>
        </div>

        {/* Privacy */}
        {model.privacy && (
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-status-info" />
            <div>
              <p className="text-[11px] text-text-tertiary">Privacy</p>
              <p className="text-sm font-medium text-text-primary capitalize">{model.privacy}</p>
            </div>
          </div>
        )}

        {/* Pricing */}
        <div className="flex items-center gap-2">
          <Coins className="size-3.5 text-status-warning" />
          <div>
            <p className="text-[11px] text-text-tertiary">Pricing</p>
            <p className="text-sm font-medium text-text-primary">{formatPrice(model)}</p>
          </div>
        </div>

        {/* Supported Resolutions */}
        {model.supported_resolutions && model.supported_resolutions.length > 0 && (
          <div className="flex items-start gap-2">
            <Maximize className="size-3.5 text-text-secondary mt-0.5" />
            <div>
              <p className="text-[11px] text-text-tertiary">Resolutions</p>
              <p className="text-sm font-medium text-text-primary">
                {model.supported_resolutions.join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Aspect Ratios */}
        {model.supported_aspect_ratios && model.supported_aspect_ratios.length > 0 && (
          <div className="flex items-start gap-2">
            <Image className="size-3.5 text-text-secondary mt-0.5" />
            <div>
              <p className="text-[11px] text-text-tertiary">Aspect Ratios</p>
              <p className="text-sm font-medium text-text-primary">
                {model.supported_aspect_ratios.join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Quality Tiers */}
        {model.quality_tiers && model.quality_tiers.length > 0 && (
          <div className="flex items-start gap-2">
            <Sparkles className="size-3.5 text-text-secondary mt-0.5" />
            <div>
              <p className="text-[11px] text-text-tertiary">Quality Tiers</p>
              <p className="text-sm font-medium text-text-primary">
                {model.quality_tiers.join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Uncensored */}
        {model.uncensored !== undefined && (
          <div className="flex items-center gap-2">
            <Ban className={cn('size-3.5', model.uncensored ? 'text-purple-400' : 'text-text-disabled')} />
            <div>
              <p className="text-[11px] text-text-tertiary">Uncensored</p>
              <p className={cn('text-sm font-medium', model.uncensored ? 'text-purple-400' : 'text-text-disabled')}>
                {model.uncensored ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
