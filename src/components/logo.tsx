import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

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
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="overflow-hidden rounded-[5px] ring-1 ring-white/15 transition-transform duration-200 group-hover:-rotate-3">
        <Image src="/logo.svg" alt="" width={28} height={28} priority />
      </span>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-[-0.035em]">
          artifacts<span className="text-[#72a5ff]">.space</span>
        </span>
      )}
    </Link>
  );
}
