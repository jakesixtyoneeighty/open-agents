import { MojoLogo } from "@/components/brand/mojo-logo";
import { BRAND } from "@/lib/brand";
import { ThemeToggle } from "./theme-toggle";

const POWERED_BY = [
  { href: "https://ai-sdk.dev/", label: "AI SDK" },
  { href: "https://vercel.com/ai-gateway", label: "AI Gateway" },
  { href: "https://vercel.com/sandbox", label: "Sandbox" },
  { href: "https://useworkflow.dev/", label: "Workflow SDK" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-(--l-border) px-6 py-12">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <MojoLogo />
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-(--l-fg-3)">
            {BRAND.tagline}
          </p>
          <p className="mt-4 text-sm text-(--l-fg-2)">{BRAND.headline}</p>
        </div>

        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
            Powered by
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {POWERED_BY.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-(--l-border) px-3 py-1 text-sm text-(--l-fg-2) transition-colors hover:border-mojo-blue/50 hover:text-(--l-fg)"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-[1200px] items-center justify-between border-t border-(--l-border-subtle) pt-6">
        <span className="text-xs text-(--l-fg-3)">
          © {new Date().getFullYear()} {BRAND.name}. Support builds tomorrow.
        </span>
        <ThemeToggle />
      </div>
    </footer>
  );
}
