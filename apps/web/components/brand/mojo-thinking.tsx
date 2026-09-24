"use client";

import { useEffect, useState } from "react";
import { MOJO_THINKING_LINES } from "@/lib/brand";
import { MojoAvatar } from "./mojo-avatar";

const ROTATE_MS = 2600;

/**
 * Mojo's working indicator: spinning avatar ring + shimmering status line.
 * When `message` is provided (e.g. sandbox status) it is shown verbatim;
 * otherwise playful status lines rotate.
 */
export function MojoThinking({ message }: { readonly message?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (message) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % MOJO_THINKING_LINES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [message]);

  const line = message ?? MOJO_THINKING_LINES[index];

  return (
    <div
      className="inline-flex items-center gap-2.5 py-0.5"
      role="status"
      aria-live="polite"
    >
      <MojoAvatar size="xs" status="thinking" />
      <span key={line} className="mojo-pop-in">
        <span className="mojo-shimmer text-sm font-medium leading-none">
          {line}
        </span>
      </span>
    </div>
  );
}
