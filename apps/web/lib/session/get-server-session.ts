import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth/config";
import { buildSession } from "./build-session";
import type { Session } from "./types";

export const getServerSession = cache(
  async (): Promise<Session | undefined> => {
    const baSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!baSession?.user) {
      return undefined;
    }

    return buildSession(baSession);
  },
);
