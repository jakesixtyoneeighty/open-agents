"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card with a gradient hairline border and a soft glow that follows the
 * cursor. Pointer position is written to CSS vars — no re-renders.
 */
export function SpotlightCard({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
      el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    },
    [],
  );

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cn(
        "mojo-border group relative overflow-hidden rounded-2xl bg-(--l-surface)/70 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 before:opacity-30 hover:before:opacity-90",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), oklch(0.63 0.2 262 / 18%), transparent 60%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
