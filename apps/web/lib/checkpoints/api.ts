import type {
  CheckpointErrorResponse,
  CheckpointRestoreRequest,
  CheckpointRestoreResponse,
  CheckpointShowResponse,
} from "./types";

export const checkpointHistoryKey = (sessionId: string) =>
  `/api/sessions/${sessionId}/checkpoints`;

export class CheckpointRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rollbackFailedPaths?: string[],
  ) {
    super(message);
    this.name = "CheckpointRequestError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body ?? {}) as Partial<CheckpointErrorResponse>;
    throw new CheckpointRequestError(
      typeof error.error === "string" ? error.error : response.statusText,
      response.status,
      Array.isArray(error.rollbackFailedPaths)
        ? error.rollbackFailedPaths
        : undefined,
    );
  }
  return body as T;
}

export async function fetchCheckpointChanges(
  sessionId: string,
  changeSetId: string,
): Promise<CheckpointShowResponse> {
  return readJson(
    await fetch(`${checkpointHistoryKey(sessionId)}/${changeSetId}`, {
      cache: "no-store",
    }),
  );
}

export async function requestCheckpointRestore(
  sessionId: string,
  request: CheckpointRestoreRequest,
): Promise<CheckpointRestoreResponse> {
  return readJson(
    await fetch(`${checkpointHistoryKey(sessionId)}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

const TOOL_LABELS: Record<string, string> = {
  edit: "Edit",
  write: "Write file",
  multi_edit: "Edit files",
  apply_patch: "Apply patch",
  undo_edit: "Undo",
  revert: "Revert",
  restore_checkpoint: "Restore checkpoint",
};

export function checkpointToolLabel(toolName: string | null): string {
  if (!toolName) return "File change";
  return TOOL_LABELS[toolName] ?? toolName;
}
