import { repoCoordinateSchema } from "./schema";

export interface RepoCoordinates {
  repoOwner: string;
  repoName: string;
}

/**
 * Accepts `owner/repo` or a GitHub URL (with or without `.git`) and returns
 * lowercased coordinates, matching how preferences are stored.
 */
export function parseRepoCoordinates(value: string): RepoCoordinates | null {
  let path = value.trim();
  const urlMatch = path.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  if (urlMatch?.[1]) path = urlMatch[1];
  path = path.replace(/\/+$/, "").replace(/\.git$/i, "");

  const segments = path.split("/");
  if (segments.length !== 2) return null;
  const owner = repoCoordinateSchema.safeParse(segments[0]);
  const name = repoCoordinateSchema.safeParse(segments[1]);
  if (!owner.success || !name.success) return null;
  return {
    repoOwner: owner.data.toLowerCase(),
    repoName: name.data.toLowerCase(),
  };
}
