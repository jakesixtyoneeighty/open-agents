import { listRepoPreferences } from "@/lib/db/repo-preferences";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const repositories = await listRepoPreferences(session.user.id);
  return Response.json({ repositories });
}
