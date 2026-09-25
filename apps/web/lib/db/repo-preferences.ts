import { and, desc, eq } from "drizzle-orm";
import type {
  RepoPreferencesData,
  RepoPreferencesSettings,
} from "@/lib/repo-preferences/schema";
import { normalizeGlobalSkillRefs } from "@/lib/skills/global-skill-refs";
import { db } from "./client";
import { type RepoPreferences, repoPreferences } from "./schema";

function normalizeRepoCoordinate(value: string): string {
  return value.trim().toLowerCase();
}

export function toRepoPreferencesData(
  row: RepoPreferences,
): RepoPreferencesData {
  return {
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    modelId: row.modelId,
    skillRefs: normalizeGlobalSkillRefs(row.skillRefs),
    setupCommand: row.setupCommand,
    checkCommand: row.checkCommand,
    instructions: row.instructions,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getRepoPreferences(
  userId: string,
  repoOwner: string,
  repoName: string,
): Promise<RepoPreferencesData | null> {
  const [row] = await db
    .select()
    .from(repoPreferences)
    .where(
      and(
        eq(repoPreferences.userId, userId),
        eq(repoPreferences.repoOwner, normalizeRepoCoordinate(repoOwner)),
        eq(repoPreferences.repoName, normalizeRepoCoordinate(repoName)),
      ),
    )
    .limit(1);

  return row ? toRepoPreferencesData(row) : null;
}

/** Looks up preferences for a session's repo; null for repo-less sessions. */
export async function getRepoPreferencesForSession(session: {
  userId: string;
  repoOwner: string | null;
  repoName: string | null;
}): Promise<RepoPreferencesData | null> {
  if (!session.repoOwner || !session.repoName) return null;
  return getRepoPreferences(
    session.userId,
    session.repoOwner,
    session.repoName,
  );
}

export async function listRepoPreferences(
  userId: string,
): Promise<RepoPreferencesData[]> {
  const rows = await db
    .select()
    .from(repoPreferences)
    .where(eq(repoPreferences.userId, userId))
    .orderBy(desc(repoPreferences.updatedAt));
  return rows.map(toRepoPreferencesData);
}

export async function upsertRepoPreferences(params: {
  userId: string;
  repoOwner: string;
  repoName: string;
  settings: RepoPreferencesSettings;
}): Promise<RepoPreferencesData> {
  const now = new Date();
  const values = {
    modelId: params.settings.modelId,
    skillRefs: params.settings.skillRefs,
    setupCommand: params.settings.setupCommand,
    checkCommand: params.settings.checkCommand,
    instructions: params.settings.instructions,
  };

  const [row] = await db
    .insert(repoPreferences)
    .values({
      userId: params.userId,
      repoOwner: normalizeRepoCoordinate(params.repoOwner),
      repoName: normalizeRepoCoordinate(params.repoName),
      ...values,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        repoPreferences.userId,
        repoPreferences.repoOwner,
        repoPreferences.repoName,
      ],
      set: { ...values, updatedAt: now },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to save repository preferences");
  }
  return toRepoPreferencesData(row);
}

/** Returns true when a row was removed. */
export async function deleteRepoPreferences(
  userId: string,
  repoOwner: string,
  repoName: string,
): Promise<boolean> {
  const rows = await db
    .delete(repoPreferences)
    .where(
      and(
        eq(repoPreferences.userId, userId),
        eq(repoPreferences.repoOwner, normalizeRepoCoordinate(repoOwner)),
        eq(repoPreferences.repoName, normalizeRepoCoordinate(repoName)),
      ),
    )
    .returning({ userId: repoPreferences.userId });
  return rows.length > 0;
}
