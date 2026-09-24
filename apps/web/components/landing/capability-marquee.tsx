const ITEMS = [
  "Reads the whole repo",
  "Runs real commands",
  "Opens the pull request",
  "Fixes failing checks",
  "Resolves merge conflicts",
  "Cloud sandboxes",
  "Voice input",
  "Durable workflows",
  "Any model via AI Gateway",
  "Explorer + executor subagents",
  "Auto commit & push",
  "Shareable sessions",
];

/** Infinite, hover-pausable ticker of what Mojo can do. */
export function CapabilityMarquee() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="mojo-marquee relative overflow-hidden border-y border-(--l-border) bg-(--l-surface-3) py-4 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="mojo-marquee-track flex w-max gap-10">
        {doubled.map((item, index) => (
          <span
            key={`${item}-${index}`}
            aria-hidden={index >= ITEMS.length}
            className="flex items-center gap-10 whitespace-nowrap font-display text-sm font-medium text-(--l-fg-2)"
          >
            {item}
            <span className="size-1.5 rounded-full bg-gradient-mojo" />
          </span>
        ))}
      </div>
    </div>
  );
}
