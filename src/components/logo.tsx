import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The artifacts.space mark, a 27 by 20 pixel-art grid with fixed brand colors.
 * It is the same in light and dark mode. It renders at one CSS pixel per grid
 * unit so every edge lands on whole device pixels.
 */
function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/artifacts-space-mark.svg"
      alt=""
      width={27}
      height={20}
      priority
      className={cn("h-5 w-[27px] shrink-0", className)}
    />
  );
}

export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="artifacts.space home">
      <LogoMark />
      {!compact && <span className="text-[15px] font-medium tracking-[-0.01em]">artifacts.space</span>}
    </Link>
  );
}
