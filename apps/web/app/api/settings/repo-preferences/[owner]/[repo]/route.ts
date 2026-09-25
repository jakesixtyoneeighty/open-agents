import {
  deleteRepoPreferences,
  getRepoPreferences,
  upsertRepoPreferences,
} from "@/lib/db/repo-preferences";
import {
  repoCoordinateSchema,
  repoPreferencesInputSchema,
} from "@/lib/repo-preferences/schema";
import { getServerSession } from "@/lib/session/get-server-session";

type RouteContext = {
  params: Promise<{ owner: string; repo: string }>;
};

type RepoTarget =
  | { ok: true; userId: string; repoOwner: string; repoName: string }
  | { ok: false; response: Response };

async function resolveTarget(context: RouteContext): Promise<RepoTarget> {
  const session = await getServerSession();
  if (!session?.user) {
    return {
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { owner, repo } = await context.params;
  const repoOwner = repoCoordinateSchema.safeParse(owner);
  const repoName = repoCoordinateSchema.safeParse(repo);
  if (!repoOwner.success || !repoName.success) {
    return {
      ok: false,
      response: Response.json({ error: "Invalid repository" }, { status: 400 }),
    };
  }

  return {
    ok: true,
    userId: session.user.id,
    repoOwner: repoOwner.data,
    repoName: repoName.data,
  };
}

export async function GET(_req: Request, context: RouteContext) {
  const target = await resolveTarget(context);
  if (!target.ok) return target.response;

  const repository = await getRepoPreferences(
    target.userId,
    target.repoOwner,
    target.repoName,
  );
  return Response.json({ repository });
}

export async function PUT(req: Request, context: RouteContext) {
  const target = await resolveTarget(context);
  if (!target.ok) return target.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = repoPreferencesInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid repository preferences",
      },
      { status: 400 },
    );
  }

  const repository = await upsertRepoPreferences({
    userId: target.userId,
    repoOwner: target.repoOwner,
    repoName: target.repoName,
    settings: parsed.data,
  });
  return Response.json({ repository });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const target = await resolveTarget(context);
  if (!target.ok) return target.response;

  const deleted = await deleteRepoPreferences(
    target.userId,
    target.repoOwner,
    target.repoName,
  );
  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
