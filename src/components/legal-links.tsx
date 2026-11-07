import Link from "next/link";

import { legalPaths } from "@/lib/legal/contact";
import { cn } from "@/lib/utils";

const linkClass = "transition-colors hover:text-foreground";

/** Privacy and Terms links for compact footers (sign-in pages, shared artifact pages). Inherits the footer's text style. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-x-5", className)}>
      <Link href={legalPaths.privacy} className={linkClass}>Privacy</Link>
      <Link href={legalPaths.terms} className={linkClass}>Terms</Link>
    </span>
  );
}

const inlineLinkClass = "text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground";

/** The agreement line under the sign-in and sign-up forms. */
export function ConsentNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-5 text-muted-foreground", className)}>
      By continuing, you agree to the <Link href={legalPaths.terms} className={inlineLinkClass}>Terms</Link> and{" "}
      <Link href={legalPaths.privacy} className={inlineLinkClass}>Privacy Policy</Link>.
    </p>
  );
}
