"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  GitPullRequestArrow,
  Github,
  Loader2,
  LockKeyhole,
  Server,
} from "lucide-react";
import { MojoAurora } from "@/components/brand/mojo-aurora";
import { MojoLogo } from "@/components/brand/mojo-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth/client";
import { BRAND } from "@/lib/brand";
import { sanitizeInternalRedirect } from "@/lib/redirect-safety";
import { skipGitHubOnboarding } from "./actions";
import { GetStartedSignOut } from "./get-started-sign-out";

type StepId = 1 | 2;

export function GetStartedFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    session,
    loading: sessionLoading,
    hasGitHubAccount,
    hasGitHubInstallations,
  } = useSession();
  const isGitHubReconnect = searchParams.get("step") === "github";
  const redirectPath = sanitizeInternalRedirect(
    searchParams.get("next"),
    "/sessions",
  );
  // Signing in already completes step 1, so open straight on GitHub.
  const [activeStep, setActiveStep] = useState<StepId>(2);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(
    () => new Set([1]),
  );

  const markComplete = useCallback((step: StepId) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
    if (step < 2) {
      setActiveStep((step + 1) as StepId);
    }
  }, []);

  const canOpenStep = (step: StepId): boolean => {
    if (step === 1) return true;
    for (let i = 1; i < step; i++) {
      if (!completedSteps.has(i as StepId)) return false;
    }
    return true;
  };

  const handleStepClick = (step: StepId) => {
    if (canOpenStep(step)) {
      setActiveStep(step);
    }
  };

  const steps: { id: StepId; title: string }[] = [
    { id: 1, title: "Your account" },
    { id: 2, title: "Connect GitHub" },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* left panel */}
      <div className="relative flex shrink-0 flex-col justify-between overflow-hidden bg-[oklch(0.12_0.03_272)] px-6 py-6 text-white md:w-1/2 md:px-12 md:py-10">
        <MojoAurora intensity="vivid" />
        <div className="relative">
          <MojoLogo className="text-white" />
        </div>
        <div className="relative hidden md:block">
          <Image
            src={BRAND.assets.hero}
            alt="Mojo, the MojoCode mascot"
            width={1122}
            height={1402}
            priority
            className="mojo-float mx-auto h-auto w-full max-w-[340px] rounded-3xl shadow-[0_40px_120px_-30px_oklch(0.45_0.22_272/80%)]"
          />
        </div>
        <p className="relative hidden max-w-sm text-sm leading-relaxed text-white/60 md:block">
          {BRAND.description}
        </p>
      </div>

      {/* right panel */}
      <div className="flex flex-1 flex-col bg-[oklch(0.145_0.03_272)] px-6 py-8 md:px-10 md:py-10">
        <div className="flex w-full flex-1 flex-col">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight text-white">
            Let&apos;s get Mojo set up
          </h1>

          <div className="flex-1">
            {steps.map((step) => {
              const isActive = activeStep === step.id;
              const isCompleted = completedSteps.has(step.id);
              const isLocked = !canOpenStep(step.id);

              return (
                <div key={step.id} className="border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => handleStepClick(step.id)}
                    disabled={isLocked}
                    className={`flex w-full items-center gap-3 py-4 text-left transition-colors duration-200 disabled:cursor-not-allowed ${
                      isLocked
                        ? "text-zinc-600"
                        : isCompleted
                          ? "text-zinc-400"
                          : isActive
                            ? "text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span
                      className={`text-sm tabular-nums ${
                        isLocked
                          ? "text-zinc-700"
                          : isActive
                            ? "text-white"
                            : "text-zinc-500"
                      }`}
                    >
                      {step.id}.
                    </span>
                    <span
                      className={`text-sm font-medium ${isActive ? "text-white" : ""}`}
                    >
                      {step.title}
                    </span>
                    {isCompleted && (
                      <Check
                        className="ml-auto size-4 text-white"
                        strokeWidth={2.5}
                      />
                    )}
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isActive
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-5">
                        {step.id === 1 && (
                          <AccountStep
                            session={session}
                            loading={sessionLoading}
                            onComplete={() => markComplete(1)}
                          />
                        )}
                        {step.id === 2 && (
                          <GitHubConnectStep
                            session={session}
                            loading={sessionLoading}
                            hasGitHubAccount={hasGitHubAccount}
                            hasGitHubInstallations={hasGitHubInstallations}
                            forceReconnect={isGitHubReconnect}
                            redirectPath={redirectPath}
                            onComplete={() => {
                              markComplete(2);
                              router.push(redirectPath);
                            }}
                            onSkip={async () => {
                              await skipGitHubOnboarding();
                              router.push(redirectPath);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <GetStartedSignOut />
          </div>
        </div>
      </div>
    </div>
  );
}

// step 1: signed-in account (display only)

function AccountStep({
  session,
  loading,
  onComplete,
}: {
  session: ReturnType<typeof useSession>["session"];
  loading: boolean;
  onComplete: () => void;
}) {
  if (loading) {
    return <Skeleton className="h-10 w-full rounded bg-white/5" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Signed in with{" "}
        {session?.authProvider === "github" ? "GitHub" : "Vercel"}. Your
        sessions, repos, and settings are private to you unless you share a
        session.
      </p>
      <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-3">
          {session?.user?.avatar ? (
            <Image
              src={session.user.avatar}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-full bg-zinc-800"
            />
          ) : (
            <div className="size-8 rounded-full bg-zinc-800" />
          )}
          <div>
            <p className="text-sm font-medium text-zinc-200">
              {session?.user?.name ?? session?.user?.username ?? "You"}
            </p>
            {session?.user?.email && (
              <p className="text-xs text-zinc-600">{session.user.email}</p>
            )}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        onClick={onComplete}
        className="gap-2 bg-gradient-mojo text-white shadow-mojo hover:brightness-110"
      >
        Continue
      </Button>
    </div>
  );
}

// step 2: github connect

function GitHubConnectStep({
  session,
  loading,
  hasGitHubAccount,
  hasGitHubInstallations,
  forceReconnect,
  redirectPath,
  onComplete,
  onSkip,
}: {
  session: ReturnType<typeof useSession>["session"];
  loading: boolean;
  hasGitHubAccount: boolean;
  hasGitHubInstallations: boolean;
  forceReconnect: boolean;
  redirectPath: string;
  onComplete: () => void;
  onSkip: () => Promise<void>;
}) {
  const [isLinking, setIsLinking] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const skipButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isSkipping || isLinking}
      onClick={async () => {
        setIsSkipping(true);
        try {
          await onSkip();
        } finally {
          setIsSkipping(false);
        }
      }}
      className="text-zinc-400 hover:bg-white/5 hover:text-white"
    >
      {isSkipping && <Loader2 className="size-4 animate-spin" />}
      Skip for now
    </Button>
  );
  const isConnected =
    !forceReconnect && hasGitHubAccount && hasGitHubInstallations;
  const shouldShowInstallStep =
    !forceReconnect && hasGitHubAccount && !hasGitHubInstallations;
  const githubInstallHref = `/api/github/app/install?next=${encodeURIComponent(redirectPath)}`;
  const githubPostLinkCallback = `/api/github/post-link?next=${encodeURIComponent(redirectPath)}`;

  if (loading) {
    return <Skeleton className="h-10 w-full rounded bg-white/5" />;
  }

  if (isConnected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5">
          <div className="flex items-center gap-3">
            {session?.user?.avatar ? (
              <Image
                src={session.user.avatar}
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-full bg-zinc-800"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-zinc-800">
                <Github className="size-4 text-zinc-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-zinc-200">
                GitHub connected
              </p>
              {session?.user?.username && (
                <p className="text-xs text-zinc-600">
                  @{session.user.username}
                </p>
              )}
            </div>
          </div>
          <Check className="size-4 text-emerald-400" strokeWidth={2.5} />
        </div>
        <Button
          size="sm"
          onClick={onComplete}
          className="gap-2 bg-gradient-mojo text-white shadow-mojo hover:brightness-110"
        >
          Get Started
        </Button>
      </div>
    );
  }

  if (shouldShowInstallStep) {
    // linked but no app installed
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          GitHub account linked
          {session?.user?.username ? ` as @${session.user.username}` : ""}. Last
          step: choose which repositories Mojo can work in.
        </p>
        <GitHubAccessExplainer />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            className="gap-2 bg-gradient-mojo text-white shadow-mojo hover:brightness-110"
          >
            <Link href={githubInstallHref}>
              <Github className="size-4" />
              Choose repositories
            </Link>
          </Button>
          {skipButton}
        </div>
      </div>
    );
  }

  // not linked
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        {forceReconnect
          ? "Reconnect your GitHub account to restore repository and installation access."
          : "Want Mojo to work in your repos? Connect GitHub — or skip and just chat for now."}
      </p>
      {!forceReconnect && <GitHubAccessExplainer />}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={isLinking || isSkipping}
          onClick={async () => {
            setIsLinking(true);
            await authClient.linkSocial({
              provider: "github",
              callbackURL: githubPostLinkCallback,
            });
          }}
          className="gap-2 bg-gradient-mojo text-white shadow-mojo hover:brightness-110"
        >
          {isLinking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Github className="size-4" />
          )}
          {forceReconnect ? "Reconnect GitHub" : "Connect GitHub"}
        </Button>
        {skipButton}
      </div>
    </div>
  );
}

const GITHUB_ACCESS_POINTS = [
  {
    icon: LockKeyhole,
    text: "You pick the repos. Mojo only sees what you grant, and you can change it any time on GitHub.",
  },
  {
    icon: Server,
    text: "Code is cloned into a private sandbox per session — never shared with other users.",
  },
  {
    icon: GitPullRequestArrow,
    text: "Mojo commits to its own branch and opens pull requests. You decide what merges.",
  },
];

function GitHubAccessExplainer() {
  return (
    <ul className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      {GITHUB_ACCESS_POINTS.map((point) => (
        <li
          key={point.text}
          className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-400"
        >
          <point.icon className="mt-0.5 size-3.5 shrink-0 text-mojo-cyan" />
          {point.text}
        </li>
      ))}
    </ul>
  );
}
