"use server";

import { cookies } from "next/headers";
import {
  GITHUB_PROMPT_DISMISSED_COOKIE,
  GITHUB_PROMPT_DISMISSED_MAX_AGE,
} from "@/lib/onboarding-prompt";

export async function skipGitHubOnboarding(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_PROMPT_DISMISSED_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: GITHUB_PROMPT_DISMISSED_MAX_AGE,
  });
}
