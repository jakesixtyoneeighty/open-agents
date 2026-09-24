"use client";

import { useEffect, useState } from "react";
import { SignInOptions } from "@/components/auth/sign-in-options";
import { MojoLogo } from "@/components/brand/mojo-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#watch", label: "Watch Mojo" },
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
];

export function LandingNav({
  showSignIn = false,
}: {
  readonly showSignIn?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 20);
    handle();
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 px-3 pt-3">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-[1200px] items-center justify-between rounded-2xl border px-4 transition-all duration-300 sm:px-5",
          scrolled
            ? "border-(--l-border) bg-(--l-bg)/70 shadow-[0_10px_40px_-20px_oklch(0.4_0.2_272/60%)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <a href="#top" className="shrink-0">
          <MojoLogo markClassName="size-6" />
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm text-(--l-fg-2) transition-colors hover:bg-(--l-surface-4) hover:text-(--l-fg)"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div
          className={cn(
            "flex items-center gap-2 transition-all duration-200",
            showSignIn
              ? "opacity-100 blur-none"
              : "pointer-events-none opacity-0 blur-xs",
          )}
        >
          <SignInOptions size="sm" className="flex-nowrap" />
        </div>
      </div>
    </nav>
  );
}
