const STEPS = [
  {
    step: "01",
    title: "Point Mojo at a repo",
    body: "Pick a GitHub repo and branch — or just start a chat. A fresh sandbox spins up in seconds.",
  },
  {
    step: "02",
    title: "Describe the job",
    body: "Type it, paste a screenshot, or say it out loud. Mojo plans, explores, and gets to work.",
  },
  {
    step: "03",
    title: "Review and ship",
    body: "Watch the diff grow live, poke the preview, then merge the PR Mojo opened for you.",
  },
];

export function MojoHowItWorks() {
  return (
    <section
      id="how"
      className="scroll-mt-24 border-y border-(--l-border) bg-(--l-surface-3) px-6 py-24"
    >
      <div className="mx-auto max-w-[1200px]">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Solve. Support. Improve.{" "}
          <span className="text-gradient-mojo">Repeat.</span>
        </h2>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-mojo opacity-40 md:block"
          />
          {STEPS.map((item) => (
            <li key={item.step} className="relative">
              <span className="relative flex size-10 items-center justify-center rounded-full bg-gradient-mojo font-mono text-sm font-semibold text-white shadow-mojo">
                {item.step}
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
