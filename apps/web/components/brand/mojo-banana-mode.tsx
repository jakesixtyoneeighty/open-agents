"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const BANANA_COUNT = 42;
const RAIN_MS = 4200;

type Banana = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  size: number;
};

function makeBananas(): Banana[] {
  return Array.from({ length: BANANA_COUNT }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2.2 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 240,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
    size: 18 + Math.random() * 22,
  }));
}

/** Konami code → banana rain. Mojo appreciates a classic. */
export function MojoBananaMode() {
  const [bananas, setBananas] = useState<Banana[] | null>(null);

  useEffect(() => {
    let position = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      position =
        key === KONAMI[position] ? position + 1 : key === KONAMI[0] ? 1 : 0;

      if (position === KONAMI.length) {
        position = 0;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          toast("🍌 Banana mode unlocked", {
            description: "Mojo salutes you.",
          });
          return;
        }
        setBananas(makeBananas());
        toast("🍌 Banana mode unlocked", {
          description: "Mojo salutes you. Now back to shipping.",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!bananas) return;
    const timer = window.setTimeout(() => setBananas(null), RAIN_MS);
    return () => window.clearTimeout(timer);
  }, [bananas]);

  if (!bananas) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      {bananas.map((banana) => (
        <span
          key={banana.id}
          className="mojo-banana absolute top-0 select-none"
          style={
            {
              left: `${banana.left}%`,
              fontSize: `${banana.size}px`,
              animationDelay: `${banana.delay}s`,
              "--mojo-duration": `${banana.duration}s`,
              "--mojo-drift": `${banana.drift}px`,
              "--mojo-spin": `${banana.spin}deg`,
            } as React.CSSProperties
          }
        >
          🍌
        </span>
      ))}
    </div>
  );
}
