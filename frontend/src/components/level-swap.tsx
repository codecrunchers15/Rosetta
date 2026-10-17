import type { ReactNode } from "react";
import { LEVELS, type LevelKey } from "@/lib/levels";
import { cn } from "@/lib/utils";

/**
 * Renders one version per level, stacked in a single grid cell. Only the
 * active one is visible; the others crossfade out with a 2px blur. Because
 * every version stays in layout, the container never changes height.
 */
export function LevelSwap({
  active,
  render,
  className,
}: {
  active: number;
  render: (key: LevelKey, isActive: boolean) => ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("swap", className)}>
      {LEVELS.map((level, i) => (
        <div key={level.key} data-active={i === active} aria-hidden={i !== active || undefined}>
          {render(level.key, i === active)}
        </div>
      ))}
    </div>
  );
}
