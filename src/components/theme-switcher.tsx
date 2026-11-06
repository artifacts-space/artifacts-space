"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { IconDeviceDesktop, IconMoon, IconSun, type Icon } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isThemeChoice, toThemeChoice, type ThemeChoice } from "@/lib/theme-choice";
import { cn } from "@/lib/utils";

const options: readonly { value: ThemeChoice; label: string; Icon: Icon }[] = [
  { value: "system", label: "System theme", Icon: IconDeviceDesktop },
  { value: "light", label: "Light theme", Icon: IconSun },
  { value: "dark", label: "Dark theme", Icon: IconMoon },
];

const frameClass = "inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-background p-0.5";
const optionClass =
  "flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors [&_svg]:size-3.5";

const noSubscribe = () => () => undefined;

/** False during server render and hydration, true after, so theme-dependent UI cannot mismatch. */
function useMounted() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** Same size as the switcher, with nothing selected, for the server render and hydration. */
function ThemeSwitcherPlaceholder({ className }: { className?: string | undefined }) {
  return (
    <div aria-hidden="true" className={cn(frameClass, className)} data-theme-switcher="placeholder">
      {options.map(({ value, Icon }) => (
        <span key={value} className={optionClass}><Icon /></span>
      ))}
    </div>
  );
}

/**
 * Compact System / Light / Dark switcher. It is a radio group: arrow keys move
 * between choices, and the selected choice is announced. next-themes stores the
 * choice; System is the default. Until mount it renders a same-size placeholder,
 * because the stored choice is unknown on the server.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!mounted) return <ThemeSwitcherPlaceholder className={className} />;

  return (
    <RadioGroup
      aria-label="Theme"
      value={toThemeChoice(theme)}
      onValueChange={(value) => { if (isThemeChoice(value)) setTheme(value); }}
      className={cn(frameClass, className)}
      data-theme-switcher=""
    >
      {options.map(({ value, label, Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <Radio.Root
                value={value}
                aria-label={label}
                className={cn(
                  optionClass,
                  "cursor-pointer hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-muted data-checked:text-foreground",
                )}
              />
            }
          >
            <Icon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </RadioGroup>
  );
}
