import { IconTerminal2 } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/** The monospace `// label` that opens a landing section, above its headline. */
export function SectionEyebrow({ children }: { children: string }) {
  return <p className="mb-4 font-mono text-sm text-muted-foreground">{`// ${children}`}</p>;
}

const corners = ["-left-[5px] -top-[5px]", "-right-[5px] -top-[5px]", "-bottom-[5px] -left-[5px]", "-bottom-[5px] -right-[5px]"] as const;

/** Registration crosshairs on the four corners of the nearest positioned box. Decorative. */
export function CornerMarks() {
  return (
    <>
      {corners.map((position) => (
        <svg key={position} aria-hidden focusable="false" width="11" height="11" viewBox="0 0 11 11" className={cn("pointer-events-none absolute text-muted-foreground", position)}>
          <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" strokeWidth="1" shapeRendering="crispEdges" />
        </svg>
      ))}
    </>
  );
}

/**
 * Who did something in a landing mockup. People are amber circles with
 * initials; agents are blue squares with a terminal glyph, so the two read
 * apart by color and shape.
 */
export function ActorBadge({ kind, initials = "", className }: { kind: "person" | "agent"; initials?: string; className?: string }) {
  if (kind === "agent") {
    return (
      <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-[2px] bg-actor-agent-tint text-actor-agent ring-2 ring-card", className)}>
        <IconTerminal2 className="size-3.5" />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-actor-person-tint text-xs font-medium text-actor-person ring-2 ring-card", className)}>
      {initials}
    </span>
  );
}
