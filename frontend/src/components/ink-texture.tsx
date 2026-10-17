/**
 * Static ink texture behind the home hero: soft layered waves in Deep and
 * Steel at 6–10%, fading out by the bottom. It gives the glass input
 * something to blur. It never moves.
 */
export function InkTexture({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 1440 900" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ink-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="ink-mask">
          <rect width="1440" height="900" fill="url(#ink-fade)" />
        </mask>
      </defs>
      <g mask="url(#ink-mask)">
        <path
          d="M0 330C180 280 330 390 560 360S930 250 1130 290 1360 360 1440 330V900H0Z"
          fill="var(--ink-a)"
          opacity="0.1"
        />
        <path
          d="M0 420C220 370 380 470 640 430S1020 340 1220 390 1400 440 1440 420V900H0Z"
          fill="var(--ink-b)"
          opacity="0.08"
        />
        <path
          d="M0 500C260 460 450 560 720 515S1080 430 1290 480 1420 520 1440 510V900H0Z"
          fill="var(--ink-a)"
          opacity="0.1"
        />
        <path
          d="M0 590C200 550 420 640 700 600S1110 520 1300 570 1420 610 1440 600V900H0Z"
          fill="var(--ink-b)"
          opacity="0.06"
        />
      </g>
    </svg>
  );
}
