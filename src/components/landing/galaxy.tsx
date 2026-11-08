"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

import {
  ARTIFACT_CELL,
  ARTIFACT_SIZE,
  GALAXY_CENTER,
  GALAXY_HEIGHT,
  GALAXY_WIDTH,
  orbitPath,
  orbits,
  PLANET_SIZE,
  stars,
  startOffset,
  type Orbit,
} from "@/lib/landing/galaxy";
import { PIXEL_TONES, pixelIcons, pixelPaths, type PixelIconName } from "@/lib/landing/pixel-icons";
import { cn } from "@/lib/utils";

import "./galaxy.css";

const sky = stars();

/** One artifact's pixel paths, centred on its own origin so it can ride an orbit. */
function Artifact({ name }: { name: PixelIconName }) {
  const paths = pixelPaths(pixelIcons[name]);
  return (
    <g transform={`translate(${String(-ARTIFACT_SIZE / 2)} ${String(-ARTIFACT_SIZE / 2)}) scale(${String(ARTIFACT_CELL)})`}>
      {PIXEL_TONES.map((tone) => {
        const d = paths[tone];
        return d ? <path key={tone} d={d} style={{ fill: `var(--pixel-${tone})` }} /> : null;
      })}
    </g>
  );
}

/** A dotted ring and the artifacts that travel it, evenly spaced, at the ring's own speed and direction. */
function Ring({ orbit, pathId }: { orbit: Orbit; pathId: string }) {
  const direction = orbit.reverse ? { keyPoints: "1;0", keyTimes: "0;1" } : {};
  return (
    <>
      <path id={pathId} d={orbitPath(orbit)} fill="none" strokeWidth={4} strokeDasharray="4 18" style={{ stroke: "var(--pixel-mid)" }} />
      {orbit.artifacts.map((name, index) => (
        <g key={name}>
          <Artifact name={name} />
          <animateMotion dur={`${String(orbit.period)}s`} begin={`${String(startOffset(orbit, index))}s`} repeatCount="indefinite" calcMode="linear" {...direction}>
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </g>
      ))}
    </>
  );
}

/** Stops the orbits while the picture is off screen, and for good when the viewer prefers reduced motion. */
function usePausedOrbits(svg: RefObject<SVGSVGElement | null>) {
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const apply = () => {
      if (reduced.matches || !visible) node.pauseAnimations();
      else node.unpauseAnimations();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      apply();
    });
    observer.observe(node);
    reduced.addEventListener("change", apply);
    apply();
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", apply);
    };
  }, [svg]);
}

/**
 * The open-source illustration: the brand planet with ten kinds of artifact
 * orbiting it on two rings that turn against each other. It draws on its own
 * night sky and pins the light pixel palette (`light`), so it reads the same
 * in both themes. Decorative: hidden from screen readers.
 */
export function Galaxy({ className }: { className?: string }) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  usePausedOrbits(svg);
  return (
    <svg
      ref={svg}
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${String(GALAXY_WIDTH)} ${String(GALAXY_HEIGHT)}`}
      shapeRendering="crispEdges"
      className={cn("light block h-auto w-full", className)}
    >
      <rect width={GALAXY_WIDTH} height={GALAXY_HEIGHT} style={{ fill: "var(--galaxy-sky)" }} />
      {sky.map((star) =>
        star.twinkle ? (
          <path key={`${String(star.x)},${String(star.y)}`} className="galaxy-twinkle" d={`M${String(star.x)} ${String(star.y - 6)}h6v6h6v6h-6v6h-6v-6h-6v-6h6z`} style={{ fill: "var(--pixel-pale)" }} />
        ) : (
          <rect key={`${String(star.x)},${String(star.y)}`} x={star.x} y={star.y} width={6} height={6} style={{ fill: "var(--pixel-light)", opacity: 0.55 }} />
        ),
      )}
      <image
        href="/artifacts-space-mark.svg"
        x={GALAXY_CENTER.x - PLANET_SIZE.width / 2}
        y={GALAXY_CENTER.y - PLANET_SIZE.height / 2}
        width={PLANET_SIZE.width}
        height={PLANET_SIZE.height}
        preserveAspectRatio="none"
      />
      {orbits.map((orbit) => <Ring key={orbit.id} orbit={orbit} pathId={`${id}-${orbit.id}`} />)}
    </svg>
  );
}
