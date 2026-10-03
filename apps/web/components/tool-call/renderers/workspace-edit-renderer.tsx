"use client";

import { MultiFileDiff } from "@pierre/diffs/react";
import { Files } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { defaultDiffOptions } from "@/lib/diffs-config";
import { CheckpointCardActions } from "@/components/checkpoints/checkpoint-card-actions";
import { FileNamePill } from "../file-name-pill";
import { ToolLayout } from "../tool-layout";

type EditToolType = "tool-multi_edit" | "tool-apply_patch" | "tool-undo_edit";

export function WorkspaceEditRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<EditToolType>) {
  const result = part.state === "output-available" ? part.output : undefined;
  const success = result?.success ? result : undefined;
  const failure = result?.success === false ? result : undefined;
  const mergedState = failure ? { ...state, error: failure.error } : state;
  const name =
    part.type === "tool-undo_edit"
      ? "Undo changes"
      : part.type === "tool-apply_patch"
        ? "Apply patch"
        : "Edit files";
  return (
    <ToolLayout
      name={name}
      icon={<Files className="h-3.5 w-3.5" />}
      summary={
        success
          ? `${success.changes.length} files`
          : part.type === "tool-undo_edit"
            ? (part.input?.changeSetId?.slice(0, 12) ?? "")
            : ""
      }
      meta={
        success
          ? success.dryRun
            ? "Preview only"
            : success.replayed
              ? "Previously applied"
              : "Applied"
          : undefined
      }
      errorMeta={
        failure?.rollbackFailedPaths?.length
          ? "Recovery needed"
          : failure
            ? "Failed"
            : undefined
      }
      state={mergedState}
      onApprove={onApprove}
      onDeny={onDeny}
      expandedContent={
        success ? (
          <div className="max-h-[32rem] space-y-3 overflow-auto rounded-md border border-border p-3">
            {success.changes.map((change) => (
              <section key={change.path} className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <FileNamePill filePath={change.path} />
                  <span>
                    {change.before === null
                      ? "Created"
                      : change.after === null
                        ? "Deleted"
                        : "Updated"}
                  </span>
                </div>
                {change.redacted ? (
                  <p>Content hidden for this file.</p>
                ) : (
                  <MultiFileDiff
                    oldFile={{
                      name: change.path,
                      contents: change.before ?? "",
                    }}
                    newFile={{
                      name: change.path,
                      contents: change.after ?? "",
                    }}
                    options={defaultDiffOptions}
                  />
                )}
              </section>
            ))}
            {!success.dryRun && (
              <CheckpointCardActions
                changeSetId={success.changeSetId}
                fallback={
                  <p className="text-xs break-all text-muted-foreground">
                    Change set {success.changeSetId}
                  </p>
                }
              />
            )}
          </div>
        ) : failure?.rollbackFailedPaths?.length ? (
          <div className="space-y-2 text-xs">
            <p>{failure.error}</p>
            <p>
              Recovery needed for: {failure.rollbackFailedPaths.join(", ")}.
              Conflicting content was preserved.
            </p>
          </div>
        ) : undefined
      }
    />
  );
}
