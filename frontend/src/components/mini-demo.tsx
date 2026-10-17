"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CARD_DEFAULT_LEVEL, DEMO_DEFAULT_LEVEL, LAST_LEVEL, LEVELS, type LevelState } from "@/lib/levels";
import { SAMPLES } from "@/lib/mock/samples";
import { BridgeSlider } from "./bridge-slider";
import { LevelSwap } from "./level-swap";

const PLAYED_KEY = "rosetta:demo-played";
/** ~1.8s from Engineer to CMO, pausing briefly at each stop. */
const STEP_MS = 380;

/**
 * Home mini demo, on the round-robin commit's cached explanation. On the
 * first visit per session it glides once from Engineer to CMO: the only
 * motion in the product nobody triggered (design.md §8).
 */
export function MiniDemo() {
  const { explanation } = SAMPLES[0].card;
  const reduceMotion = useReducedMotion();
  const [level, setLevel] = useState<LevelState>({ index: DEMO_DEFAULT_LEVEL, source: "program" });
  const sliderRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const timers = useRef<number[]>([]);

  const stop = () => {
    touched.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (reduceMotion) {
      setLevel({ index: CARD_DEFAULT_LEVEL, source: "keyboard" });
      return;
    }
    let played = false;
    try {
      played = sessionStorage.getItem(PLAYED_KEY) === "1";
    } catch {
      /* no storage: play it */
    }
    const el = sliderRef.current;
    if (played || !el) return;

    const play = () => {
      if (touched.current) return;
      try {
        sessionStorage.setItem(PLAYED_KEY, "1");
      } catch {
        /* ignore */
      }
      for (let i = 1; i <= LAST_LEVEL; i++) {
        timers.current.push(
          window.setTimeout(() => !touched.current && setLevel({ index: i, source: "program" }), (i - 1) * STEP_MS),
        );
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timers.current.push(window.setTimeout(play, 600));
      },
      { threshold: 1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduceMotion]);

  return (
    <figure className="w-full" aria-label="Example: one commit explained at six levels">
      <div
        className="rounded-md bg-surface-1 p-6 text-left shadow-elev-1 sm:p-8"
        onPointerDownCapture={stop}
        onKeyDownCapture={stop}
        data-swap-source={level.source === "keyboard" ? "keyboard" : undefined}
      >
        <div ref={sliderRef}>
          <BridgeSlider
            variant="mini"
            value={level.index}
            source={level.source}
            onChange={(index, source) => setLevel({ index, source })}
          />
        </div>
        <LevelSwap
          active={level.index}
          className="mt-6"
          render={(key) => (
            <>
              <p className="t-micro text-fg-3">{LEVELS.find((l) => l.key === key)!.label}</p>
              <p className="mt-2 t-summary text-fg-1 text-pretty">{explanation.levels[key].summary}</p>
            </>
          )}
        />
        <p className="sr-only" aria-live="polite">
          {LEVELS[level.index].label}: {explanation.levels[LEVELS[level.index].key].summary}
        </p>
      </div>
      <figcaption className="mt-4 text-center t-small text-fg-3">The same commit, at six levels of detail.</figcaption>
    </figure>
  );
}
