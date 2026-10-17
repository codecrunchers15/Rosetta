import type { ApiErrorCode } from "./types";

/** Errors say what happened and what to do (design.md §6). */
export const ERROR_COPY: Record<ApiErrorCode, { message: string; action: "example" | "sample" | "retry" | "focus" }> = {
  invalid_url: { message: "That isn't a GitHub commit or pull request link.", action: "example" },
  private: {
    message: "This repository is private. Rosetta can only read public repositories for now.",
    action: "sample",
  },
  not_found: { message: "No commit found at that link. Check the commit ID.", action: "focus" },
  unavailable: { message: "Explanations are unavailable right now. Try again in a minute.", action: "retry" },
  network: { message: "Explanations are unavailable right now. Try again in a minute.", action: "retry" },
  sample_only: {
    message: "Rosetta is running on sample data, so only the three samples can be explained for now.",
    action: "sample",
  },
};
