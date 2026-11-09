"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

/**
 * An on/off switch. On is a green track (--switch-on) with a white thumb on
 * the right; off is a quiet track near the card (--switch-off) with a hairline
 * edge and a muted grey thumb on the left. Focus keeps the --brand ring.
 * Sizes: default is a 44×24 pill with an 18px thumb, sm a 32×18 pill with a
 * 14px thumb.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // Focus is a solid --brand outline, offset from the pill: the track has no border to tint, and a
        // translucent ring falls under 3:1 on a white card. An invalid switch gets a solid destructive ring.
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-[background-color,box-shadow] duration-200 ease-out outline-none motion-reduce:transition-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-invalid:ring-2 aria-invalid:ring-destructive",
        // All in rem, so the thumb keeps its inset when the reader raises the default font size.
        "data-[size=default]:h-6 data-[size=default]:w-11 data-[size=default]:p-[0.1875rem] data-[size=sm]:h-[1.125rem] data-[size=sm]:w-8 data-[size=sm]:p-[0.125rem]",
        // Hover deepens the on track in both modes (toward the ink in light, toward the page in dark), so the white thumb never drops
        // under 3:1. deepen() in src/lib/themes/derive.ts derives theme tokens with the same direction and tints; change both together.
        "data-checked:bg-switch-on data-checked:hover:not-data-disabled:bg-[color-mix(in_oklch,var(--switch-on),var(--foreground)_var(--switch-on-hover-tint))] dark:data-checked:hover:not-data-disabled:bg-[color-mix(in_oklch,var(--switch-on),var(--background)_var(--switch-on-hover-tint))]",
        "data-unchecked:bg-switch-off data-unchecked:inset-ring data-unchecked:inset-ring-input data-unchecked:hover:not-data-disabled:bg-[color-mix(in_oklch,var(--switch-off),var(--foreground)_var(--switch-off-hover-tint))]",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full shadow-xs transition-[translate,scale,background-color] duration-200 ease-out motion-reduce:transition-none group-data-[size=default]/switch:size-[1.125rem] group-data-[size=sm]/switch:size-3.5 data-checked:bg-switch-on-thumb data-unchecked:bg-switch-off-thumb data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-3.5 group-[:active:not([data-disabled])]/switch:scale-90"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
