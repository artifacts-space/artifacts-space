import { PixelAvatar, type AvatarKind } from "@/components/pixel-avatar";
import { cn } from "@/lib/utils";

/** Forty fixed seeds, shaped like real user ids, so the gallery never changes between runs. */
const seeds = Array.from({ length: 40 }, (_, index) => `gallery-user-${String(index).padStart(2, "0")}`);
const sizes = [20, 32, 64] as const;
const kinds: { kind: AvatarKind; label: string }[] = [
  { kind: "person", label: "People" },
  { kind: "agent", label: "Agents" },
  { kind: "team", label: "Teams" },
];

function AvatarRow({ size, kind, gridSize }: { size: number; kind: AvatarKind; gridSize?: number }) {
  return (
    <div className="flex flex-wrap gap-2" data-avatar-row={`${kind}-${String(size)}`}>
      {seeds.map((seed) => <PixelAvatar key={seed} seed={seed} kind={kind} size={size} label={seed} {...(gridSize ? { gridSize } : {})} />)}
    </div>
  );
}

/** Every size and kind on one theme. `dark` forces the dark palette inside a light page. */
function ThemePanel({ title, dark = false }: { title: string; dark?: boolean }) {
  return (
    <div className={cn("min-w-0 space-y-4 rounded-lg border bg-background p-4 text-foreground sm:p-5", dark && "dark")} data-avatar-panel={title}>
      <p className="text-xs text-muted-foreground">{title}</p>
      {kinds.map(({ kind, label }) => (
        <div key={kind} className="space-y-3">
          <p className="text-sm font-medium">{label}</p>
          {sizes.map((size) => (
            <div key={size} className="space-y-1.5">
              <p className="font-mono text-xs text-muted-foreground">{size}px</p>
              <AvatarRow size={size} kind={kind} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The two grids side by side at the small sizes, which is where they differ. */
function GridComparison() {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-4 sm:p-5" data-avatar-panel="grids">
      <p className="text-xs text-muted-foreground">5×5 (in use) and 7×7, at 20px and 32px</p>
      {[5, 7].map((gridSize) => (
        <div key={gridSize} className="space-y-1.5">
          <p className="font-mono text-xs text-muted-foreground">{gridSize}×{gridSize}</p>
          <AvatarRow size={20} kind="person" gridSize={gridSize} />
          <AvatarRow size={32} kind="person" gridSize={gridSize} />
        </div>
      ))}
    </div>
  );
}

/**
 * The avatar beside a comment author. Mention chips stay text-only: at 14px
 * the frame shape is lost, so the avatar would add color without telling
 * people from agents, which the chip already does.
 */
function InContext() {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-4 text-md sm:p-5" data-avatar-panel="context">
      <p className="flex items-center gap-2 text-xs">
        <PixelAvatar seed="gallery-user-03" size={20} />
        <span className="font-medium">@charles</span>
        <span className="text-muted-foreground">Nov 6, 2026, 9:12 PM UTC</span>
      </p>
      <p className="flex items-center gap-2 text-xs">
        <PixelAvatar seed="gallery-user-11" kind="agent" size={20} />
        <span className="font-medium">@reviewer for Charles</span>
        <span className="text-muted-foreground">Nov 6, 2026, 9:14 PM UTC</span>
      </p>
    </div>
  );
}

/** Pixel avatars for the dev gallery: forty seeds at three sizes, people, agents, and teams, light and dark. */
export function AvatarGallery() {
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <ThemePanel title="Current theme" />
        <ThemePanel title="Dark" dark />
      </div>
      <GridComparison />
      <InContext />
    </div>
  );
}
