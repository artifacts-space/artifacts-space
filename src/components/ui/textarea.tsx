import * as React from "react"
import { cn } from "cn"

/**
 * The least height of a field with `rows`: that many lines of its own text,
 * plus the field's vertical padding (`py-2`: 0.5rem above and below) and its
 * border (1px above and below), both set in the class list under it. Change
 * the padding or the border there and change this with them;
 * `e2e/a11y-fields.spec.ts` measures the three against each other.
 */
const rowsMinHeight = "min-h-[calc(var(--textarea-rows)*1lh+1rem+2px)]"

/**
 * A text area that grows with what is typed (`field-sizing: content`). With
 * that, a browser no longer reads `rows` as a height, so `rows` is given
 * here as the least number of lines the field shows.
 */
function Textarea({ className, rows, style, ...props }: React.ComponentProps<"textarea">) {
  const sized = rows === undefined ? style : ({ "--textarea-rows": String(rows), ...style } as React.CSSProperties)
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      style={sized}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        rows !== undefined && rowsMinHeight,
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
