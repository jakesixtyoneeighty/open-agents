import type { Metadata } from "next";
import { RepoPreferencesSection } from "../repo-preferences-section";

export const metadata: Metadata = {
  title: "Repositories",
  description: "Save per-repository defaults reused by every new session.",
};

export default function RepositoriesPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Defaults for a repository, applied to every session you start on it.
          Only you can see and use them.
        </p>
      </div>
      <RepoPreferencesSection />
    </div>
  );
}
