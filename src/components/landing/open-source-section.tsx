import Link from "next/link";
import { IconBrandGithub } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { docsHref } from "@/lib/docs/pages";
import { dotMatrix, type MatrixDot } from "@/lib/landing/dot-matrix";
import { REPO_URL } from "@/lib/site-copy";

import { SectionEyebrow } from "./section-marks";
import "./open-source.css";

const COLUMNS = 34;
const ROWS = 13;
const CELL = 10;
const DOT = 8;

const dots = dotMatrix("MIT", COLUMNS, ROWS);

const dimOpacity: Record<MatrixDot["level"], number> = { 0: 0, 1: 0.07, 2: 0.14, 3: 0.26 };

/** The sign: MIT in lit dots on a fading field of dim ones. Some of the brightest dim dots twinkle (open-source.css). */
function MitSign() {
  return (
    <svg
      role="img"
      aria-label="MIT"
      viewBox={`0 0 ${String(COLUMNS * CELL)} ${String(ROWS * CELL)}`}
      className="matrix-fade h-auto w-full"
    >
      {dots.map((dot) => (
        <rect
          key={`${String(dot.x)},${String(dot.y)}`}
          x={dot.x * CELL + (CELL - DOT) / 2}
          y={dot.y * CELL + (CELL - DOT) / 2}
          width={DOT}
          height={DOT}
          rx={1.5}
          className={!dot.lit && dot.level === 3 ? "matrix-twinkle" : undefined}
          style={{
            fill: dot.lit ? "var(--matrix-lit)" : "var(--matrix-dim)",
            opacity: dot.lit ? 1 : dimOpacity[dot.level],
            animationDelay: `${String(((dot.x * 7 + dot.y * 13) % 40) / 10)}s`,
          }}
        />
      ))}
    </svg>
  );
}

/** Open source, MIT licensed: the copy and its buttons on the left, the dot-matrix sign on the right. */
export function OpenSourceSection() {
  return (
    <section id="open-source" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="open-source-heading">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <SectionEyebrow>open source</SectionEyebrow>
          <h2 id="open-source-heading" className="max-w-[560px] text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
            Open source from day one.
          </h2>
          <p className="mt-5 max-w-[560px] text-base leading-7 text-muted-foreground">
            artifacts.space is MIT licensed. Read the code, change it, and run it on your own Postgres. Your artifacts never get locked inside one company, including ours.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button render={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant="outline" className="h-10 px-4 text-sm">
              <IconBrandGithub data-icon="inline-start" /> View on GitHub
            </Button>
            <Button render={<Link href={docsHref("self-hosting")} />} nativeButton={false} variant="ghost" className="h-10 px-4 text-sm">
              Host it yourself
            </Button>
          </div>
        </div>
        <MitSign />
      </div>
    </section>
  );
}
