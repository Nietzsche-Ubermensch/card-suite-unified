import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, ScanSearch, Sparkles, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ScanDropzone from '@/components/cleanup/ScanDropzone';
import { fileToBase64 } from '@/lib/file-utils';
import { cn } from '@/lib/utils';
import type { CardComps, CardDraft, CardIdentity } from '@/types';

const SPORTS = ['baseball', 'basketball', 'football', 'hockey', 'soccer', 'wrestling', 'racing', 'other'] as const;

const EMPTY: CardDraft = {
  playerName: '',
  team: '',
  sport: 'wrestling',
  manufacturer: '',
  productSet: '',
  copyrightYear: '',
  statsYear: '',
  cardNumber: '',
  serialNumber: '',
  parallelType: '',
  insertSet: '',
  isRookie: false,
  isAutograph: false,
  isMemorabilia: false,
  gradingCompany: '',
  grade: '',
};

/** A side of the card: the front shows the parallel, the back the year and number. */
function SideUpload({
  side,
  file,
  previewUrl,
  onDrop,
  onClear,
  disabled,
}: {
  side: 'Front' | 'Back';
  file: File | null;
  previewUrl: string | null;
  onDrop: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs text-text-secondary">
          {side}
          {side === 'Back' && <span className="ml-1 text-text-tertiary">— card number &amp; © year</span>}
        </Label>
        {file && (
          <button
            type="button"
            onClick={onClear}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label={`Remove ${side.toLowerCase()} image`}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {previewUrl ? (
        <div className="relative rounded-lg border border-border-subtle overflow-hidden bg-app-input">
          <img src={previewUrl} alt={`${side} of card`} className="w-full h-[190px] object-contain" />
        </div>
      ) : (
        <div className="[&>div]:min-h-[190px]">
          <ScanDropzone onFileDrop={onDrop} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-xs text-text-secondary">{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 bg-app-input border-border-subtle text-sm"
      />
      {hint && <p className="text-[11px] text-text-tertiary leading-tight">{hint}</p>}
    </div>
  );
}

export default function PriceCheck() {
  const [draft, setDraft] = useState<CardDraft>(EMPTY);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [comps, setComps] = useState<CardComps | null>(null);
  const [identity, setIdentity] = useState<CardIdentity | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Two different failures with two different lifetimes: a comps error belongs
  // to the current search and must not outlive it, while an identify error
  // (a missing Venice key, say) is about the upload and stays until the next
  // attempt — clearing the player name should not hide it.
  const [compsError, setCompsError] = useState<string | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);

  // Object URLs are revoked on replace/unmount so previews don't leak.
  useEffect(() => () => { if (frontUrl) URL.revokeObjectURL(frontUrl); }, [frontUrl]);
  useEffect(() => () => { if (backUrl) URL.revokeObjectURL(backUrl); }, [backUrl]);

  const set = useCallback(<K extends keyof CardDraft>(key: K, value: CardDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const takeSide = useCallback(
    (side: 'front' | 'back') => (file: File) => {
      const url = URL.createObjectURL(file);
      if (side === 'front') {
        setFrontUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setFront(file);
      } else {
        setBackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setBack(file);
      }
    },
    [],
  );

  const clearSide = useCallback((side: 'front' | 'back') => () => {
    if (side === 'front') {
      setFrontUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setFront(null);
    } else {
      setBackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setBack(null);
    }
  }, []);

  /** Everything the comps search needs, in the API's field names. */
  const cardPayload = useMemo(
    () => ({
      playerName: draft.playerName.trim(),
      team: draft.team.trim() || null,
      sport: draft.sport,
      manufacturer: draft.manufacturer.trim() || null,
      productSet: draft.productSet.trim() || null,
      copyrightYear: draft.copyrightYear.trim() ? Number(draft.copyrightYear.trim()) : null,
      // Sent so the server re-derives the same inferred year AND re-emits its
      // "confirm this against the card back" warning on every refresh.
      statsYear: draft.statsYear.trim() ? Number(draft.statsYear.trim()) : null,
      cardNumber: draft.cardNumber.trim() || null,
      serialNumber: draft.serialNumber.trim() || null,
      parallelType: draft.parallelType.trim() || null,
      insertSet: draft.insertSet.trim() || null,
      isRookie: draft.isRookie,
      isAutograph: draft.isAutograph,
      isMemorabilia: draft.isMemorabilia,
      gradingCompany: draft.gradingCompany.trim() || null,
      grade: draft.grade.trim() || null,
    }),
    [draft],
  );

  const hasPlayer = Boolean(cardPayload.playerName);

  // Comps are built server-side from local knowledge only — no API key, no
  // network calls to a marketplace — so they can refresh as the user types.
  const seq = useRef(0);
  useEffect(() => {
    if (!hasPlayer) return; // nothing to search for; render derives the empty state
    const mine = ++seq.current;
    // Links from the previous card next to an error message would read as
    // comps for the card on screen, so a failure drops them.
    const fail = (message: string) => {
      setCompsError(message);
      setComps(null);
      setIdentity(null);
      setWarnings([]);
    };
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/cards/comps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ card: cardPayload }),
        });
        // A dead or restarting API answers with something that isn't JSON, and
        // "Unexpected end of JSON input" tells the user nothing about why their
        // comps stopped updating.
        const body = await res.json().catch(() => null);
        if (mine !== seq.current) return; // a newer edit already won
        if (!res.ok || !body) return fail(body?.error || `The comps service returned HTTP ${res.status}.`);
        setCompsError(null);
        setComps(body.comps);
        setIdentity(body.card);
        setWarnings(body.warnings ?? []);
      } catch (e) {
        if (mine === seq.current) {
          fail(e instanceof TypeError ? 'Could not reach the comps service — is the API running?' : e instanceof Error ? e.message : String(e));
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cardPayload, hasPlayer]);

  const identify = useCallback(async () => {
    if (!front && !back) return;
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const [frontB64, backB64] = await Promise.all([
        front ? fileToBase64(front) : Promise.resolve(null),
        back ? fileToBase64(back) : Promise.resolve(null),
      ]);
      const res = await fetch('/api/cards/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ front: frontB64, back: backB64 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      const c: CardIdentity = body.card;
      // An inferred year must not be written into the copyright-year box: doing
      // that makes the next refresh read it back as a year taken off the
      // copyright line, and the "confirm this against the card back" warning
      // disappears for a year nobody ever read. Keep the stats year instead and
      // let the server re-infer — and re-warn — every time.
      const inferred = c.yearSource === 'stats-inferred';
      setDraft({
        playerName: c.playerName ?? '',
        team: c.team ?? '',
        sport: (c.sport as CardDraft['sport']) ?? 'other',
        manufacturer: c.manufacturer ?? '',
        productSet: c.productSet ?? '',
        copyrightYear: !inferred && c.year ? String(c.year) : '',
        statsYear: c.statsYear ? String(c.statsYear) : '',
        cardNumber: c.cardNumber ?? '',
        serialNumber: c.serial ?? '',
        parallelType: c.parallel ?? '',
        insertSet: c.insertSet ?? '',
        isRookie: Boolean(c.isRookie),
        isAutograph: Boolean(c.isAutograph),
        isMemorabilia: Boolean(c.isMemorabilia),
        gradingCompany: c.gradingCompany ?? '',
        grade: c.grade ?? '',
      });
      toast.success(`Identified ${c.playerName ?? 'card'}${c.confidence != null ? ` (${Math.round(c.confidence * 100)}% confident)` : ''}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setIdentifyError(msg);
      toast.error(/VENICE_API_KEY/.test(msg) ? 'Card identification needs a Venice API key — fill the fields in by hand to get comps.' : msg);
    } finally {
      setIdentifying(false);
    }
  }, [front, back]);

  // Derived, not cleared in an effect: an empty player name shows the empty state
  // regardless of what the last search returned.
  const shownComps = hasPlayer ? comps : null;
  const shownWarnings = hasPlayer ? warnings : [];
  const shownIdentity = hasPlayer ? identity : null;
  // A comps error belongs to a search that is no longer running once the player
  // name is cleared; an identify error is about the upload and outlives it.
  const shownError = identifyError ?? (hasPlayer ? compsError : null);
  const hasImages = Boolean(front || back);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Price Check</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Identify a sports or wrestling card, then jump straight to its sold comps.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* ── Identify ───────────────────────────────────────────── */}
        <section className="rounded-lg border border-border-subtle bg-app-panel p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ScanSearch className="size-4 text-text-secondary" strokeWidth={1.5} />
            <h2 className="text-sm font-medium text-text-primary">Scan the card</h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <SideUpload side="Front" file={front} previewUrl={frontUrl} onDrop={takeSide('front')} onClear={clearSide('front')} disabled={identifying} />
            <SideUpload side="Back" file={back} previewUrl={backUrl} onDrop={takeSide('back')} onClear={clearSide('back')} disabled={identifying} />
          </div>

          <Button onClick={identify} disabled={!hasImages || identifying} className="w-full">
            {identifying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {identifying ? 'Identifying…' : 'Identify card'}
          </Button>
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            Identification reads both sides with a vision model and needs a Venice API key. Comps below work without one —
            fill the fields in by hand and the searches update as you type.
          </p>

          <Separator className="bg-border-subtle" />

          {/* ── Identity form ───────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Player" value={draft.playerName} onChange={(v) => set('playerName', v)} placeholder="Julia Hart" className="col-span-2" />
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Sport</Label>
              <Select value={draft.sport} onValueChange={(v) => set('sport', v as CardDraft['sport'])}>
                <SelectTrigger className="h-8 bg-app-input border-border-subtle text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPORTS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Team / promotion" value={draft.team} onChange={(v) => set('team', v)} placeholder="AEW" />
            <Field label="Year (© line)" value={draft.copyrightYear} onChange={(v) => set('copyrightYear', v)} placeholder="2026" hint="From the copyright line, not the stats" />
            <Field label="Manufacturer" value={draft.manufacturer} onChange={(v) => set('manufacturer', v)} placeholder="Upper Deck" />
            <Field label="Product" value={draft.productSet} onChange={(v) => set('productSet', v)} placeholder="Chrome / Prizm / Finest" />
            <Field label="Card #" value={draft.cardNumber} onChange={(v) => set('cardNumber', v)} placeholder="22" />
            <Field label="Insert / subset" value={draft.insertSet} onChange={(v) => set('insertSet', v)} placeholder="Star Entrances" />
            <Field label="Parallel" value={draft.parallelType} onChange={(v) => set('parallelType', v)} placeholder="Checkerboard Refractor" hint="Use the hobby name so sellers' listings match" />
            <Field label="Serial" value={draft.serialNumber} onChange={(v) => set('serialNumber', v)} placeholder="190/299" hint="Searched as the print run, not your copy" />
            <Field label="Grader" value={draft.gradingCompany} onChange={(v) => set('gradingCompany', v)} placeholder="PSA" />
            <Field label="Grade" value={draft.grade} onChange={(v) => set('grade', v)} placeholder="10" />
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            {([['isRookie', 'Rookie'], ['isAutograph', 'Autograph'], ['isMemorabilia', 'Relic']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <Switch checked={draft[key]} onCheckedChange={(v) => set(key, v)} />
                {label}
              </label>
            ))}
          </div>
        </section>

        {/* ── Comps ──────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border-subtle bg-app-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Sold comps</h2>
            {shownIdentity?.setName && <Badge variant="secondary" className="text-[11px]">{shownIdentity.setName}</Badge>}
          </div>

          {shownError && (
            <div className="flex gap-2 rounded-md border border-status-error/30 bg-status-error/10 p-2.5 text-xs text-status-error">
              <TriangleAlert className="size-3.5 shrink-0 mt-px" />
              <span>{shownError}</span>
            </div>
          )}

          {shownWarnings.map((w) => (
            <div key={w} className="flex gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-2.5 text-xs text-status-warning">
              <TriangleAlert className="size-3.5 shrink-0 mt-px" />
              <span>{w}</span>
            </div>
          ))}

          {!shownComps && !shownError && (
            <p className="text-sm text-text-tertiary py-8 text-center">
              Enter a player name to build comp searches.
            </p>
          )}

          {shownComps?.searches.map((s) => {
            const isPick = s.tier === shownComps.recommended;
            return (
              <div
                key={s.tier}
                className={cn(
                  'rounded-md border p-3 space-y-2',
                  isPick ? 'border-status-info/50 bg-status-info/5' : 'border-border-subtle',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium capitalize text-text-primary">{s.tier}</span>
                  {isPick && <Badge className="text-[10px] h-4 px-1.5">start here</Badge>}
                </div>
                <p className="text-[11px] text-text-tertiary leading-snug">{s.description}</p>
                <code className="block text-[11px] text-text-secondary bg-app-input rounded px-2 py-1.5 break-words">
                  {s.query}
                </code>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant={isPick ? 'default' : 'secondary'} className="h-7 text-xs">
                    <a href={s.soldUrl} target="_blank" rel="noopener noreferrer">
                      Sold <ExternalLink className="size-3" />
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-text-secondary">
                    <a href={s.activeUrl} target="_blank" rel="noopener noreferrer">
                      Active <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>
              </div>
            );
          })}

          {shownComps && (
            <ul className="text-[11px] text-text-tertiary space-y-1 pt-1 list-disc pl-4">
              {shownComps.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
