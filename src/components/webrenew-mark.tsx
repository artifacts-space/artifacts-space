import { cn } from "@/lib/utils";

/**
 * The Webrenew mark: a rounded square with the double-chevron "W". The square
 * takes the text color and the mark takes the page background, so it reads in
 * light and dark mode. The paths are Webrenew's own; keep them exact.
 */
export function WebrenewMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 250 250" fill="none" aria-hidden="true" focusable="false" className={cn("size-5 shrink-0", className)}>
      <rect width="250" height="250" rx="50" fill="currentColor" />
      <path
        className="fill-background"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M50.9952 62H101.122C109.342 62 116.005 68.7836 116.005 77.1515V119.577C116.005 121.683 116.583 123.711 117.621 125.25L125.019 136.212L91.7784 185.677C90.5946 187.439 88.5813 187.441 87.3949 185.683L46.6159 125.25C45.5776 123.711 45 121.683 45 119.577V70.3066C45 65.719 47.6841 62 50.9952 62ZM133.995 77.1515C133.995 68.7836 140.658 62 148.878 62H199.005C202.316 62 205 65.719 205 70.3066V119.586C205 121.687 204.426 123.71 203.393 125.247L162.784 185.677C161.6 187.439 159.587 187.441 158.4 185.683L125.019 136.212L132.387 125.247C133.42 123.71 133.995 121.687 133.995 119.586V77.1515Z"
      />
    </svg>
  );
}
