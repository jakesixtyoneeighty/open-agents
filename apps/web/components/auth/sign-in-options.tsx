"use client";

import { cn } from "@/lib/utils";
import { isGitHubSignInEnabled, SignInButton } from "./sign-in-button";

/**
 * GitHub (primary) + Vercel sign-in pair. GitHub is hidden when its OAuth
 * client isn't configured, leaving Vercel as the primary option.
 */
export function SignInOptions({
  size = "lg",
  callbackUrl = "/sessions",
  className,
}: {
  readonly size?: "sm" | "lg";
  readonly callbackUrl?: string;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {isGitHubSignInEnabled && (
        <SignInButton
          provider="github"
          size={size}
          variant="mojo"
          callbackUrl={callbackUrl}
        />
      )}
      <SignInButton
        provider="vercel"
        size={size}
        variant={isGitHubSignInEnabled ? "outline" : "mojo"}
        callbackUrl={callbackUrl}
      />
    </div>
  );
}
