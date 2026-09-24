import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import type { Session } from "./types";

type BetterAuthSession = {
  session: { createdAt: Date };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    [key: string]: unknown;
  };
};

function extractUsername(user: BetterAuthSession["user"]): string {
  if (typeof user.username === "string" && user.username) {
    return user.username;
  }
  return user.name ?? "";
}

/**
 * Users can sign in with Vercel or GitHub. A linked Vercel account unlocks
 * Vercel-only features (project sync, deployment previews), so it wins when
 * both are present.
 */
async function getPrimaryAuthProvider(
  userId: string,
): Promise<Session["authProvider"]> {
  const rows = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  return rows.some((row) => row.providerId === "vercel") ? "vercel" : "github";
}

export async function buildSession(
  baSession: BetterAuthSession,
): Promise<Session> {
  return {
    created: baSession.session.createdAt.getTime(),
    authProvider: await getPrimaryAuthProvider(baSession.user.id),
    user: {
      id: baSession.user.id,
      username: extractUsername(baSession.user),
      email: baSession.user.email ?? undefined,
      avatar: baSession.user.image ?? "",
      name: baSession.user.name ?? undefined,
    },
  };
}
