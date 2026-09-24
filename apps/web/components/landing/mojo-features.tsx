import {
  Boxes,
  BrainCircuit,
  GitPullRequestArrow,
  Mic,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SpotlightCard } from "@/components/brand/spotlight-card";

type Feature = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
};

const FEATURES: readonly Feature[] = [
  {
    icon: BrainCircuit,
    title: "Understands your repo",
    body: "Mojo explores with read-only subagents first, then hands off to executors — so changes land where they belong.",
  },
  {
    icon: Boxes,
    title: "A sandbox per session",
    body: "Every session gets an isolated cloud machine with its own branch, filesystem, and dev server. Nothing touches your laptop.",
  },
  {
    icon: GitPullRequestArrow,
    title: "Ships the PR",
    body: "Auto-commit, push, and open a pull request. When checks fail or conflicts appear, Mojo fixes those too.",
  },
  {
    icon: Workflow,
    title: "Never loses the thread",
    body: "Agent loops run as durable workflows. Close the tab, lose Wi-Fi — reconnect and Mojo is still working.",
  },
  {
    icon: Mic,
    title: "Talk it through",
    body: "Describe the bug out loud. Voice input turns rambling into a precise task.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    body: "Approvals for sensitive tools, live diffs, and one-click stop. Mojo helps; people decide.",
  },
];

export function MojoFeatures() {
  return (
    <section id="features" className="scroll-mt-24 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-mojo-blue dark:text-mojo-cyan">
            Senior Help Desk Mojo
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            Support that{" "}
            <span className="text-gradient-mojo">builds tomorrow.</span>
          </h2>
          <p className="mt-4 text-balance text-(--l-fg-2) sm:text-lg">
            Everything an agent needs to go from ticket to merged — wrapped in a
            teammate you actually want to work with.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <SpotlightCard key={feature.title} className="p-6">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-mojo-soft ring-1 ring-(--l-border)">
                <feature.icon className="size-5 text-mojo-cyan" />
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-(--l-fg-2)">
                {feature.body}
              </p>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}
