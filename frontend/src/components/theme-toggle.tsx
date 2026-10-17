"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "./button";
import { MoonIcon, SunIcon } from "./icons";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = !mounted || resolvedTheme !== "light";

  const toggle = () => {
    const root = document.documentElement;
    root.classList.add("theming");
    setTheme(isDark ? "light" : "dark");
    window.setTimeout(() => root.classList.remove("theming"), 250);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </Button>
  );
}
