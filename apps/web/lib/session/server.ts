import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { buildSession } from "./build-session";
import type { Session } from "./types";

export async function getSessionFromReq(
  req: NextRequest,
): Promise<Session | undefined> {
  const baSession = await auth.api.getSession({
    headers: req.headers,
  });

  if (!baSession?.user) {
    return undefined;
  }

  return buildSession(baSession);
}
