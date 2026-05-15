import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AlertTriangle, ImagePlus, Upload, Globe, Sparkles, Loader2, Check,
  FileText, MessageCircle, Video, Music2, Code2, Briefcase, ShoppingBag,
  GraduationCap, Gamepad2, Camera, Mail, Calendar, Map, Cloud, Bot, Newspaper, Headphones,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  iconPath?: string;
  iconDataUrl?: string;
  /** Used by the "From URL" tab to fetch the site's favicon. */
  appUrl?: string;
  /** Used by the library tab as the file-name hint when saving. */
  appName?: string;
  onChange: (val: { path: string; dataUrl: string } | null) => void;
}

type Mode = "upload" | "url" | "library";

interface LibraryEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  /** [from, to] hex colors for the linear gradient bg. */
  grad: [string, string];
}

// Keep this list small + opinionated. Each entry pairs a Lucide icon with a
// gradient. Rendered to a 256×256 PNG when picked.
const LIBRARY: LibraryEntry[] = [
  { id: "notes",     label: "Notes",        icon: FileText,       grad: ["#3b82f6", "#06b6d4"] },
  { id: "chat",      label: "Chat",         icon: MessageCircle,  grad: ["#7c3aed", "#ec4899"] },
  { id: "video",     label: "Video",        icon: Video,          grad: ["#ef4444", "#f97316"] },
  { id: "music",     label: "Music",        icon: Music2,         grad: ["#f59e0b", "#ef4444"] },
  { id: "dev",       label: "Dev",          icon: Code2,          grad: ["#10b981", "#059669"] },
  { id: "work",      label: "Work",         icon: Briefcase,      grad: ["#475569", "#0f172a"] },
  { id: "shop",      label: "Shop",         icon: ShoppingBag,    grad: ["#f43f5e", "#a855f7"] },
  { id: "study",     label: "Study",        icon: GraduationCap,  grad: ["#0ea5e9", "#6366f1"] },
  { id: "game",      label: "Game",         icon: Gamepad2,       grad: ["#8b5cf6", "#22d3ee"] },
  { id: "photo",     label: "Photo",        icon: Camera,         grad: ["#fb7185", "#fbbf24"] },
  { id: "mail",      label: "Mail",         icon: Mail,           grad: ["#2563eb", "#06b6d4"] },
  { id: "calendar",  label: "Calendar",     icon: Calendar,       grad: ["#dc2626", "#f59e0b"] },
  { id: "map",       label: "Maps",         icon: Map,            grad: ["#16a34a", "#0ea5e9"] },
  { id: "weather",   label: "Weather",      icon: Cloud,          grad: ["#0284c7", "#7dd3fc"] },
  { id: "ai",        label: "AI",           icon: Bot,            grad: ["#a855f7", "#3b82f6"] },
  { id: "news",      label: "News",         icon: Newspaper,      grad: ["#1f2937", "#374151"] },
  { id: "podcast",   label: "Podcast",      icon: Headphones,     grad: ["#9333ea", "#db2777"] },
  { id: "web",       label: "Web",          icon: Globe,          grad: ["#0d9488", "#0ea5e9"] },
];

export default function IconUploader({ iconPath, iconDataUrl, appUrl, appName, onChange }: Props) {
  const [mode, setMode] = useState<Mode>("upload");
  const [busy, setBusy] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pickedLibraryId, setPickedLibraryId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!iconDataUrl) { setDimensions(null); return; }
    const img = new Image();
    img.onload = () => setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setDimensions(null);
    img.src = iconDataUrl;
  }, [iconDataUrl]);

  const tooSmall = !!dimensions && (dimensions.w < 256 || dimensions.h < 256);
  const ext = iconPath ? iconPath.toLowerCase().split(".").pop() : undefined;
  const winNeedsLargerPng = tooSmall && ext === "png";
  const trimmedUrl = (appUrl || "").trim();
  const canFetchFavicon = /^https?:\/\//i.test(trimmedUrl) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmedUrl);

  const onUploadClick = async () => {
    setBusy(true);
    try {
      const result = await api.dialog.pickIcon();
      if (result) onChange(result);
    } finally { setBusy(false); }
  };

  const onFetchFavicon = async () => {
    setBusy(true); setFetchError(null);
    try {
      const result = await api.dialog.fetchFavicon(trimmedUrl);
      if (!result) setFetchError("Couldn't find a favicon for this site. Try Upload or Library instead.");
      else onChange(result);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const onPickLibraryEntry = async (entry: LibraryEntry) => {
    setBusy(true); setPickedLibraryId(entry.id); setFetchError(null);
    try {
      const dataUrl = await renderLibraryIconToPng(entry, 256);
      const hint = appName ? `${appName}-${entry.id}` : entry.id;
      const result = await api.dialog.saveIconDataUrl(dataUrl, hint);
      onChange(result);
    } catch (e) {
      // Most common cause: the new IPC handler isn't registered yet —
      // the Electron main process needs a rebuild + restart.
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="w-full">
      {/* mode tabs */}
      <div className="flex items-center gap-1 mb-3 p-1 rounded-lg bg-bg-input/60 border border-border w-fit">
        <TabButton active={mode === "upload"}  onClick={() => setMode("upload")}  icon={<Upload size={13} />}    label="Upload" />
        <TabButton active={mode === "url"}     onClick={() => setMode("url")}     icon={<Globe size={13} />}     label="From URL" />
        <TabButton active={mode === "library"} onClick={() => setMode("library")} icon={<Sparkles size={13} />}  label="Library" />
      </div>

      {mode === "upload" && (
        <button
          type="button"
          onClick={onUploadClick}
          disabled={busy}
          className="w-full border-2 border-dashed border-border-strong rounded-xl p-10 flex flex-col items-center gap-3 hover:border-accent-blue/60 hover:bg-bg-input/40 transition cursor-pointer"
        >
          <Preview iconDataUrl={iconDataUrl} />
          <div className="text-center">
            <div className="text-sm text-text-primary">{iconDataUrl ? "Change icon" : "Click to upload or drag and drop"}</div>
            <div className="text-xs text-text-secondary mt-1">PNG, ICO, ICNS, JPG, SVG. Use a 256×256+ PNG (or .ico) to embed your icon in the .exe.</div>
            {iconPath && (
              <div className="text-[11px] text-text-muted mt-1 truncate max-w-md">
                {iconPath}{dimensions ? ` — ${dimensions.w}×${dimensions.h}` : ""}
              </div>
            )}
          </div>
        </button>
      )}

      {mode === "url" && (
        <div className="border-2 border-dashed border-border-strong rounded-xl p-6 flex flex-col items-center gap-4">
          <Preview iconDataUrl={iconDataUrl} />
          <div className="text-center">
            <div className="text-sm text-text-primary">Grab the icon from your site</div>
            <div className="text-xs text-text-secondary mt-1 max-w-md">
              Pulls the highest-resolution apple-touch-icon or favicon from{" "}
              <span className="font-mono text-text-primary">{trimmedUrl || "the URL"}</span>.
            </div>
          </div>
          <button
            type="button"
            disabled={!canFetchFavicon || busy}
            onClick={onFetchFavicon}
            className={cn(
              "h-9 px-4 rounded-md text-sm font-medium inline-flex items-center gap-2 transition",
              !canFetchFavicon
                ? "bg-bg-input text-text-muted cursor-not-allowed"
                : "bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-60"
            )}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            {busy ? "Fetching…" : "Fetch favicon"}
          </button>
          {!canFetchFavicon && (
            <div className="text-[11px] text-text-muted">Enter a URL above first.</div>
          )}
          {fetchError && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs max-w-md">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{fetchError}</span>
            </div>
          )}
        </div>
      )}

      {mode === "library" && (
        <div className="border-2 border-dashed border-border-strong rounded-xl p-4">
          <div className="text-xs text-text-secondary mb-3 px-1">
            Click an icon — we render it as a 256×256 PNG and use it as your app icon.
          </div>
          {fetchError && (
            <div className="mb-3 flex items-start gap-2 p-2.5 rounded-md bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{fetchError}</span>
            </div>
          )}
          <div className="grid grid-cols-6 gap-2.5">
            {LIBRARY.map((entry) => (
              <button
                key={entry.id}
                type="button"
                disabled={busy}
                onClick={() => onPickLibraryEntry(entry)}
                title={entry.label}
                className={cn(
                  "relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-white transition disabled:opacity-50",
                  "hover:scale-[1.04] hover:shadow-lg active:scale-[0.98]",
                  pickedLibraryId === entry.id && "ring-2 ring-white/80 ring-offset-2 ring-offset-bg"
                )}
                style={{ background: `linear-gradient(135deg, ${entry.grad[0]} 0%, ${entry.grad[1]} 100%)` }}
              >
                <entry.icon size={26} strokeWidth={1.8} />
                <span className="text-[10px] font-medium opacity-90">{entry.label}</span>
                {busy && pickedLibraryId === entry.id && (
                  <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                )}
                {!busy && pickedLibraryId === entry.id && iconDataUrl && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white text-black flex items-center justify-center">
                    <Check size={10} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {winNeedsLargerPng && (
        <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-accent-yellow/10 border border-accent-yellow/30 text-accent-yellow text-xs">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            This PNG is {dimensions!.w}×{dimensions!.h}. Windows requires at least 256×256 to embed it
            as the .exe icon. The build will succeed using the default Electron icon — replace with a
            larger PNG or .ico to embed your own.
          </span>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-md text-xs inline-flex items-center gap-1.5 transition",
        active ? "bg-bg-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Preview({ iconDataUrl }: { iconDataUrl?: string }) {
  if (iconDataUrl) {
    return <img src={iconDataUrl} alt="App icon" className="w-16 h-16 rounded-xl object-cover bg-bg-input" />;
  }
  return (
    <div className="w-16 h-16 rounded-xl bg-bg-input flex items-center justify-center text-text-muted">
      <ImagePlus size={24} />
    </div>
  );
}

/**
 * Render a library entry to a base64 PNG at the given size. We serialize the
 * Lucide React component to an SVG string, draw it onto a canvas over a
 * gradient + rounded-square background, then export.
 */
async function renderLibraryIconToPng(entry: LibraryEntry, size: number): Promise<string> {
  // Lucide icons accept a `color` prop that maps to stroke. We render at the
  // canvas's intrinsic icon size so anti-aliasing is sharp at 256.
  const iconSize = Math.round(size * 0.52);
  const Icon = entry.icon;
  const svgMarkup = renderToStaticMarkup(
    <Icon size={iconSize} color="#ffffff" strokeWidth={2} absoluteStrokeWidth />
  );

  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgMarkup);
  const img = await loadImage(svgUrl);

  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't get 2D canvas context");

  // Rounded-square gradient background
  const radius = size * 0.22;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, entry.grad[0]);
  grad.addColorStop(1, entry.grad[1]);
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, 0, 0, size, size, radius);
  ctx.fill();

  // Centered icon
  const x = (size - iconSize) / 2;
  const y = (size - iconSize) / 2;
  ctx.drawImage(img, x, y, iconSize, iconSize);

  return canvas.toDataURL("image/png");
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

