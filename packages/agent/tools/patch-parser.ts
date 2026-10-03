import type { PatchHunk, WorkspaceEditOperation } from "@open-agents/sandbox";

/** Strict, context-based patch syntax. No shell execution or fuzzy matching. */
export function parseWorkspacePatch(
  patch: string,
  revisions: Record<string, string>,
): WorkspaceEditOperation[] {
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== "*** Begin Patch" || lines.pop() !== "*** End Patch") {
    throw new Error(
      "Patch must start with *** Begin Patch and end with *** End Patch.",
    );
  }
  const operations: WorkspaceEditOperation[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = lines[index++] ?? "";
    const match = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(header);
    if (!match?.[1] || !match[2])
      throw new Error(`Invalid patch header at line ${index + 1}.`);
    const [, kind, path] = match;
    if (!path) throw new Error("Missing file path");
    if (kind === "Add") {
      const content: string[] = [];
      while (index < lines.length && !lines[index]?.startsWith("*** ")) {
        const line = lines[index++] ?? "";
        if (!line.startsWith("+"))
          throw new Error("Added file lines must start with +.");
        content.push(line.slice(1));
      }
      operations.push({
        kind: "create",
        path,
        content: content.length ? `${content.join("\n")}\n` : "",
      });
      continue;
    }
    const expectedRevision = revisions[path];
    if (!expectedRevision)
      throw new Error(`Provide the revision returned by read for ${path}.`);
    if (kind === "Delete") {
      operations.push({ kind: "delete", path, expectedRevision });
      continue;
    }
    let moveTo: string | undefined;
    if (lines[index]?.startsWith("*** Move to: ")) {
      moveTo = lines[index++]?.slice("*** Move to: ".length);
    }
    const hunks: PatchHunk[] = [];
    while (
      index < lines.length &&
      !/^\*\*\* (Add|Update|Delete) File: /.test(lines[index] ?? "")
    ) {
      const marker = lines[index++] ?? "";
      if (!/^@@(?: .*)?$/.test(marker))
        throw new Error(
          "Each update hunk must start with @@ (optional context label).",
        );
      const hunk: PatchHunk = { before: [], after: [] };
      let changed = false;
      while (index < lines.length) {
        const line = lines[index] ?? "";
        if (line.startsWith("@@") || line.startsWith("*** ")) break;
        index++;
        const prefix = line[0];
        if (prefix !== " " && prefix !== "+" && prefix !== "-")
          throw new Error("Hunk lines must start with a space, +, or -.");
        if (prefix !== "+") hunk.before.push(line.slice(1));
        if (prefix !== "-") hunk.after.push(line.slice(1));
        if (prefix !== " ") changed = true;
      }
      if (lines[index] === "*** End of File") {
        hunk.atEnd = true;
        index++;
      }
      if (!changed)
        throw new Error("Each patch hunk must change at least one line.");
      hunks.push(hunk);
    }
    if (!hunks.length && !moveTo)
      throw new Error("Update needs at least one hunk or a move destination.");
    operations.push({
      kind: "update",
      path,
      expectedRevision,
      ...(moveTo ? { moveTo } : {}),
      ...(hunks.length ? { hunks } : {}),
    });
  }
  if (!operations.length || operations.length > 25)
    throw new Error("Patch must contain 1–25 file operations.");
  return operations;
}
