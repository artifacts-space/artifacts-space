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
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none motion-reduce:transition-none group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "data-[size=default]:h-6 data-[size=default]:w-11 data-[size=default]:p-[3px] data-[size=sm]:h-[18px] data-[size=sm]:w-8 data-[size=sm]:p-[2px]",
        "data-checked:bg-switch-on data-checked:hover:bg-[color-mix(in_oklch,var(--switch-on),var(--foreground)_10%)]",
        "data-unchecked:bg-switch-off data-unchecked:inset-ring data-unchecked:inset-ring-input data-unchecked:hover:bg-[color-mix(in_oklch,var(--switch-off),var(--foreground)_6%)]",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:data-checked:bg-switch-on data-disabled:hover:data-unchecked:bg-switch-off",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full shadow-xs transition-[translate,scale,background-color] duration-200 ease-out motion-reduce:transition-none group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3.5 data-checked:bg-switch-on-thumb data-unchecked:bg-switch-off-thumb data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-3.5 group-[:active:not([data-disabled])]/switch:scale-90"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
