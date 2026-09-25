"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModelCombobox } from "@/components/model-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useModelOptions } from "@/hooks/use-model-options";
import { withMissingModelOption } from "@/lib/model-options";
import {
  REPO_CHECK_COMMAND_MAX_LENGTH,
  REPO_INSTRUCTIONS_MAX_LENGTH,
  REPO_SETUP_COMMAND_MAX_LENGTH,
  REPO_SKILL_REFS_MAX,
  type RepoPreferencesInput,
  type RepoPreferencesSettings,
} from "@/lib/repo-preferences/schema";
import {
  type GlobalSkillRef,
  globalSkillRefSchema,
} from "@/lib/skills/global-skill-refs";

const DEFAULT_MODEL_ITEM_ID = "__user-default__";

interface FormState {
  modelId: string | null;
  skillRefs: GlobalSkillRef[];
  setupCommand: string;
  checkCommand: string;
  instructions: string;
}

function toFormState(settings: RepoPreferencesSettings): FormState {
  return {
    modelId: settings.modelId,
    skillRefs: settings.skillRefs,
    setupCommand: settings.setupCommand ?? "",
    checkCommand: settings.checkCommand ?? "",
    instructions: settings.instructions ?? "",
  };
}

function toInput(form: FormState): RepoPreferencesInput {
  return {
    modelId: form.modelId,
    skillRefs: form.skillRefs,
    setupCommand: form.setupCommand,
    checkCommand: form.checkCommand,
    instructions: form.instructions,
  };
}

function isSameForm(a: FormState, b: FormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function RepoPreferencesEditor({
  repoOwner,
  repoName,
  initial,
  isSaved,
  onSave,
  onDelete,
  onCancel,
}: {
  repoOwner: string;
  repoName: string;
  initial: RepoPreferencesSettings;
  /** False for a repository that has not been saved yet. */
  isSaved: boolean;
  /** Resolves with the settings as stored (trimmed, normalized). */
  onSave: (input: RepoPreferencesInput) => Promise<RepoPreferencesSettings>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const { modelOptions, loading: modelOptionsLoading } = useModelOptions();
  const initialForm = useMemo(() => toFormState(initial), [initial]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillSource, setSkillSource] = useState("");
  const [skillName, setSkillName] = useState("");
  const [skillError, setSkillError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isDirty = !isSaved || !isSameForm(form, initialForm);
  const idPrefix = `repo-${repoOwner}-${repoName}`.replace(/[^\w-]/g, "-");

  const modelItems = useMemo(
    () => [
      { id: DEFAULT_MODEL_ITEM_ID, label: "Use my default model" },
      ...withMissingModelOption(modelOptions, form.modelId).map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        isVariant: option.isVariant,
      })),
    ],
    [modelOptions, form.modelId],
  );

  const addSkill = () => {
    const parsed = globalSkillRefSchema.safeParse({
      source: skillSource,
      skillName,
    });
    if (!parsed.success) {
      setSkillError(parsed.error.issues[0]?.message ?? "Invalid skill");
      return;
    }
    const duplicate = form.skillRefs.some(
      (ref) =>
        ref.source.toLowerCase() === parsed.data.source.toLowerCase() &&
        ref.skillName.toLowerCase() === parsed.data.skillName.toLowerCase(),
    );
    if (duplicate) {
      setSkillError("That skill has already been added");
      return;
    }
    if (form.skillRefs.length >= REPO_SKILL_REFS_MAX) {
      setSkillError(`At most ${REPO_SKILL_REFS_MAX} skills`);
      return;
    }
    setForm((prev) => ({
      ...prev,
      skillRefs: [...prev.skillRefs, parsed.data],
    }));
    setSkillSource("");
    setSkillName("");
    setSkillError(null);
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await onSave(toInput(form));
      setForm(toFormState(saved));
      toast.success(`Saved preferences for ${repoOwner}/${repoName}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onDelete();
      setConfirmDeleteOpen(false);
      toast.success(`Removed preferences for ${repoOwner}/${repoName}`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete",
      );
      setConfirmDeleteOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-5 px-3 pb-4 pt-1">
      <div className="grid gap-2">
        <Label>Model</Label>
        <ModelCombobox
          value={form.modelId ?? DEFAULT_MODEL_ITEM_ID}
          items={modelItems}
          placeholder="Select a model"
          searchPlaceholder="Search models..."
          emptyText={modelOptionsLoading ? "Loading..." : "No models found."}
          disabled={isSaving || modelOptionsLoading}
          onChange={(value) =>
            setForm((prev) => ({
              ...prev,
              modelId: value === DEFAULT_MODEL_ITEM_ID ? null : value,
            }))
          }
        />
        <p className="text-xs text-muted-foreground">
          Used for new chats in this repository. You can still switch models per
          chat.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Skills</Label>
        <p className="text-xs text-muted-foreground">
          Installed in addition to your global skills when a session starts.
        </p>
        {form.skillRefs.length > 0 ? (
          <div className="divide-y divide-border/60 rounded-lg border border-border/70">
            {form.skillRefs.map((ref) => (
              <div
                key={`${ref.source}-${ref.skillName}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {ref.skillName}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {ref.source}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      skillRefs: prev.skillRefs.filter((item) => item !== ref),
                    }))
                  }
                  disabled={isSaving}
                  aria-label={`Remove ${ref.skillName}`}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-skill-source`} className="text-xs">
              Repository source
            </Label>
            <Input
              id={`${idPrefix}-skill-source`}
              value={skillSource}
              onChange={(event) => setSkillSource(event.target.value)}
              placeholder="vercel/ai"
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-skill-name`} className="text-xs">
              Skill name
            </Label>
            <Input
              id={`${idPrefix}-skill-name`}
              value={skillName}
              onChange={(event) => setSkillName(event.target.value)}
              placeholder="ai-sdk"
              disabled={isSaving}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addSkill}
            disabled={isSaving}
          >
            <Plus />
            Add
          </Button>
        </div>
        {skillError ? (
          <p className="text-xs text-destructive">{skillError}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-setup`}>Setup command</Label>
        <Textarea
          id={`${idPrefix}-setup`}
          value={form.setupCommand}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, setupCommand: event.target.value }))
          }
          maxLength={REPO_SETUP_COMMAND_MAX_LENGTH}
          placeholder="pnpm install"
          spellCheck={false}
          className="min-h-10 font-mono text-xs md:text-xs"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          Runs in the repository root each time a fresh sandbox is set up, for
          up to 4 minutes. A failure does not stop the session.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-check`}>Check command</Label>
        <Input
          id={`${idPrefix}-check`}
          value={form.checkCommand}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, checkCommand: event.target.value }))
          }
          maxLength={REPO_CHECK_COMMAND_MAX_LENGTH}
          placeholder="pnpm run ci"
          spellCheck={false}
          className="font-mono text-xs md:text-xs"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          The agent runs this to verify its changes and reports the real result.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-instructions`}>Instructions</Label>
        <Textarea
          id={`${idPrefix}-instructions`}
          value={form.instructions}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, instructions: event.target.value }))
          }
          maxLength={REPO_INSTRUCTIONS_MAX_LENGTH}
          placeholder="Conventions, areas to avoid, how you like changes explained…"
          className="min-h-24"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          Added to the agent&apos;s instructions for every chat in this
          repository, including sessions already running.
        </p>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={isSaving || !isDirty}>
          {isSaved ? "Save changes" : "Save repository"}
        </Button>
        {isSaved ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setForm(initialForm)}
              disabled={isSaving || !isDirty}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isSaving}
            >
              <Trash2 />
              Remove
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
        )}
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove repository preferences?</DialogTitle>
            <DialogDescription>
              New sessions on {repoOwner}/{repoName} will use your account
              defaults. Existing sessions keep their chats, but stop receiving
              these instructions and check command.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={isSaving}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
