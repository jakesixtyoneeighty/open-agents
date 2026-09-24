import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isManagedTemplateTrialUser } from "@/lib/managed-template-trial";
import { needsOnboarding } from "@/lib/onboarding";
import { GITHUB_PROMPT_DISMISSED_COOKIE } from "@/lib/onboarding-prompt";
import { getServerSession } from "@/lib/session/get-server-session";
import { SessionsIndexShell } from "./sessions-index-shell";

export const metadata: Metadata = {
  title: "Sessions",
  description: "View and manage your sessions.",
};

/**
 * Sign-in lands here. Users without GitHub access get asked to connect it
 * once; "Skip for now" sets a cookie so they aren't asked again. Deep links
 * to a specific session skip this check entirely.
 */
async function shouldPromptForGitHub(): Promise<boolean> {
  const session = await getServerSession();
  if (!session?.user) return false;

  const cookieStore = await cookies();
  if (cookieStore.has(GITHUB_PROMPT_DISMISSED_COOKIE)) return false;

  const requestHost = (await headers()).get("host") ?? "";
  if (isManagedTemplateTrialUser(session, requestHost)) return false;

  return needsOnboarding(session.user.id);
}

export default async function SessionsPage() {
  if (await shouldPromptForGitHub()) {
    redirect("/get-started?next=/sessions");
  }

  return <SessionsIndexShell />;
}
