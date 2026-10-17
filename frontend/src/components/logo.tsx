import Link from "next/link";

/** ◐ The same idea at two depths: deep water below, light above. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="var(--color-steel)" />
      <path d="M2 12a10 10 0 0 1 20 0Z" fill="var(--text-1)" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--ring-strong)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="press -mx-2 inline-flex h-10 items-center gap-2 rounded-sm px-2 font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-fg-1"
    >
      <LogoMark />
      Rosetta
    </Link>
  );
}
