import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonStyles = cva(
  "press relative inline-flex shrink-0 items-center justify-center gap-2 rounded-sm px-4 t-small font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-(--btn-primary-bg) text-(--btn-primary-fg) enabled:hover:bg-(--btn-primary-hover)",
        secondary: "bg-surface-2 text-fg-1 shadow-ring enabled:hover:bg-(--surface-3)",
        ghost: "text-(--ghost-fg) enabled:hover:bg-surface-2 enabled:hover:text-fg-1",
      },
      size: {
        md: "h-10 pointer-coarse:h-11",
        icon: "size-10 px-0 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & { loading?: boolean };

/**
 * While loading, the label crossfades to a spinner (with a 2px blur during
 * the swap). The label keeps its space, so the button never changes width.
 */
export function Button({ variant, size, loading = false, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="swap place-items-center">
        <span data-active={!loading} className="inline-flex items-center gap-2">
          {children}
        </span>
        <span data-active={loading} className="inline-flex items-center justify-center">
          <Spinner />
        </span>
      </span>
    </button>
  );
}
