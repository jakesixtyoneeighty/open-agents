import { type AgentContext, getSandbox } from "@open-agents/agent";
import { tool } from "ai";
import { z } from "zod";
import { getUserOctokit, type Octokit } from "@/lib/github/client";

const MAX_LOG_CHARS = 12_000;
const MAX_ANNOTATIONS = 50;
const MAX_COMMENT_CHARS = 1_500;
const MAX_COMMENTS = 60;

type GitHubToolContext = {
  octokit: Octokit;
  owner: string;
  repo: string;
};

type ResolvedContext =
  | { ok: true; context: GitHubToolContext }
  | { ok: false; error: string };

function isAgentContext(value: unknown): value is AgentContext {
  return typeof value === "object" && value !== null && "sandbox" in value;
}

async function resolveGitHubContext(
  experimentalContext: unknown,
): Promise<ResolvedContext> {
  const github = isAgentContext(experimentalContext)
    ? experimentalContext.github
    : undefined;
  if (!github) {
    return {
      ok: false,
      error: "This session is not connected to a GitHub repository.",
    };
  }

  const octokit = await getUserOctokit(github.userId);
  if (!octokit) {
    return {
      ok: false,
      error:
        "GitHub account is not connected. Ask the user to connect GitHub in settings.",
    };
  }

  return {
    ok: true,
    context: { octokit, owner: github.owner, repo: github.repo },
  };
}

async function getCurrentBranch(
  experimentalContext: unknown,
): Promise<string | null> {
  try {
    const sandbox = await getSandbox(experimentalContext, "github");
    const result = await sandbox.exec(
      "git rev-parse --abbrev-ref HEAD",
      sandbox.workingDirectory,
      10_000,
    );
    const branch = result.stdout.trim();
    if (result.success && branch && branch !== "HEAD") {
      return branch;
    }
  } catch {
    // Fall back to the branch recorded when the sandbox connected.
  }

  return isAgentContext(experimentalContext)
    ? (experimentalContext.sandbox.currentBranch ?? null)
    : null;
}

async function resolvePrNumber(
  context: GitHubToolContext,
  experimentalContext: unknown,
  prNumber: number | undefined,
): Promise<{ prNumber: number } | { error: string }> {
  if (prNumber !== undefined) {
    return { prNumber };
  }

  const branch = await getCurrentBranch(experimentalContext);
  if (!branch) {
    return { error: "Could not determine the current branch." };
  }

  const { data } = await context.octokit.rest.pulls.list({
    owner: context.owner,
    repo: context.repo,
    head: `${context.owner}:${branch}`,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 1,
  });

  const pr = data[0];
  if (!pr) {
    return {
      error: `No pull request found for branch "${branch}". It may not be pushed or have a PR yet.`,
    };
  }

  return { prNumber: pr.number };
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function toErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 403 || status === 404) {
    return `GitHub denied access (${status}): ${message}. The GitHub App may need Checks, Actions, and Pull requests read permissions.`;
  }
  return message;
}

type CheckState = "passed" | "failed" | "pending" | "skipped";

function toCheckState(
  status: string | null,
  conclusion: string | null,
): CheckState {
  if (status !== "completed") return "pending";
  switch (conclusion) {
    case "success":
      return "passed";
    case "skipped":
    case "neutral":
      return "skipped";
    default:
      return "failed";
  }
}

const prNumberSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(
    "Pull request number. Omit to use the PR for the current git branch.",
  );

export const githubPrStatusTool = tool({
  needsApproval: false,
  description: `Get the pull request for the current branch (or a given number) with its CI checks.

Returns PR state, mergeability, head/base branches, and every check run and commit status with its result. Use the check id with github_check_logs to see why a check failed.`,
  inputSchema: z.object({ prNumber: prNumberSchema }),
  execute: async ({ prNumber }, { experimental_context }) => {
    const resolved = await resolveGitHubContext(experimental_context);
    if (!resolved.ok) return { success: false as const, error: resolved.error };
    const { context } = resolved;

    try {
      const pr = await resolvePrNumber(context, experimental_context, prNumber);
      if ("error" in pr) return { success: false as const, error: pr.error };

      const { data: pull } = await context.octokit.rest.pulls.get({
        owner: context.owner,
        repo: context.repo,
        pull_number: pr.prNumber,
      });

      const [checkRuns, statuses] = await Promise.all([
        context.octokit.rest.checks.listForRef({
          owner: context.owner,
          repo: context.repo,
          ref: pull.head.sha,
          per_page: 100,
        }),
        context.octokit.rest.repos.getCombinedStatusForRef({
          owner: context.owner,
          repo: context.repo,
          ref: pull.head.sha,
          per_page: 100,
        }),
      ]);

      const checks = [
        ...checkRuns.data.check_runs.map((run) => ({
          kind: "check_run" as const,
          id: run.id,
          name: run.name,
          state: toCheckState(run.status, run.conclusion),
          conclusion: run.conclusion,
          app: run.app?.slug ?? null,
          detailsUrl: run.details_url ?? null,
        })),
        ...statuses.data.statuses.map((status) => ({
          kind: "status" as const,
          id: status.id,
          name: status.context,
          state:
            status.state === "success"
              ? ("passed" as const)
              : status.state === "pending"
                ? ("pending" as const)
                : ("failed" as const),
          conclusion: status.state,
          app: null,
          detailsUrl: status.target_url ?? null,
          description: status.description ?? null,
        })),
      ];

      const summary = {
        total: checks.length,
        passed: checks.filter((check) => check.state === "passed").length,
        failed: checks.filter((check) => check.state === "failed").length,
        pending: checks.filter((check) => check.state === "pending").length,
      };

      return {
        success: true as const,
        pr: {
          number: pull.number,
          title: pull.title,
          url: pull.html_url,
          state: pull.merged_at ? "merged" : pull.state,
          draft: pull.draft ?? false,
          mergeable: pull.mergeable,
          mergeableState: pull.mergeable_state,
          headBranch: pull.head.ref,
          headSha: pull.head.sha,
          baseBranch: pull.base.ref,
        },
        summary,
        checks,
      };
    } catch (error) {
      return { success: false as const, error: toErrorMessage(error) };
    }
  },
});

export const githubCheckLogsTool = tool({
  needsApproval: false,
  description: `Get the details of one CI check run: its output summary, annotations (file/line errors), and the tail of the job log for GitHub Actions checks.

Use the check id from github_pr_status (kind "check_run").`,
  inputSchema: z.object({
    checkRunId: z.number().int().positive().describe("Check run id"),
  }),
  execute: async ({ checkRunId }, { experimental_context }) => {
    const resolved = await resolveGitHubContext(experimental_context);
    if (!resolved.ok) return { success: false as const, error: resolved.error };
    const { context } = resolved;

    try {
      const [{ data: run }, { data: annotations }] = await Promise.all([
        context.octokit.rest.checks.get({
          owner: context.owner,
          repo: context.repo,
          check_run_id: checkRunId,
        }),
        context.octokit.rest.checks.listAnnotations({
          owner: context.owner,
          repo: context.repo,
          check_run_id: checkRunId,
          per_page: MAX_ANNOTATIONS,
        }),
      ]);

      // For GitHub Actions, the check run id is also the workflow job id.
      let logTail: string | null = null;
      let logError: string | null = null;
      if (run.app?.slug === "github-actions") {
        try {
          const { data } =
            await context.octokit.rest.actions.downloadJobLogsForWorkflowRun({
              owner: context.owner,
              repo: context.repo,
              job_id: checkRunId,
            });
          const log = typeof data === "string" ? data : String(data);
          logTail =
            log.length > MAX_LOG_CHARS ? log.slice(-MAX_LOG_CHARS) : log;
        } catch (error) {
          logError = toErrorMessage(error);
        }
      }

      return {
        success: true as const,
        check: {
          id: run.id,
          name: run.name,
          state: toCheckState(run.status, run.conclusion),
          conclusion: run.conclusion,
          app: run.app?.slug ?? null,
          detailsUrl: run.details_url ?? null,
          title: run.output.title ?? null,
          summary: run.output.summary
            ? truncate(run.output.summary, 3_000)
            : null,
          text: run.output.text ? truncate(run.output.text, 3_000) : null,
        },
        annotations: annotations.map((annotation) => ({
          path: annotation.path,
          startLine: annotation.start_line,
          endLine: annotation.end_line,
          level: annotation.annotation_level,
          title: annotation.title ?? null,
          message: truncate(annotation.message ?? "", 500),
        })),
        logTail,
        ...(logError ? { logError } : {}),
      };
    } catch (error) {
      return { success: false as const, error: toErrorMessage(error) };
    }
  },
});

export const githubPrCommentsTool = tool({
  needsApproval: false,
  description: `Get review feedback on a pull request: review summaries, inline review comments (with file and line), and general discussion comments, oldest first.`,
  inputSchema: z.object({ prNumber: prNumberSchema }),
  execute: async ({ prNumber }, { experimental_context }) => {
    const resolved = await resolveGitHubContext(experimental_context);
    if (!resolved.ok) return { success: false as const, error: resolved.error };
    const { context } = resolved;

    try {
      const pr = await resolvePrNumber(context, experimental_context, prNumber);
      if ("error" in pr) return { success: false as const, error: pr.error };

      const params = {
        owner: context.owner,
        repo: context.repo,
        per_page: 100,
      };
      const [reviews, reviewComments, issueComments] = await Promise.all([
        context.octokit.rest.pulls.listReviews({
          ...params,
          pull_number: pr.prNumber,
        }),
        context.octokit.rest.pulls.listReviewComments({
          ...params,
          pull_number: pr.prNumber,
        }),
        context.octokit.rest.issues.listComments({
          ...params,
          issue_number: pr.prNumber,
        }),
      ]);

      const comments = [
        ...reviews.data
          .filter((review) => review.body?.trim())
          .map((review) => ({
            kind: "review" as const,
            author: review.user?.login ?? "unknown",
            createdAt: review.submitted_at ?? null,
            state: review.state,
            body: truncate(review.body ?? "", MAX_COMMENT_CHARS),
          })),
        ...reviewComments.data.map((comment) => ({
          kind: "inline" as const,
          id: comment.id,
          author: comment.user?.login ?? "unknown",
          createdAt: comment.created_at,
          path: comment.path,
          line: comment.line ?? comment.original_line ?? null,
          inReplyToId: comment.in_reply_to_id ?? null,
          body: truncate(comment.body, MAX_COMMENT_CHARS),
        })),
        ...issueComments.data.map((comment) => ({
          kind: "discussion" as const,
          author: comment.user?.login ?? "unknown",
          createdAt: comment.created_at,
          body: truncate(comment.body ?? "", MAX_COMMENT_CHARS),
        })),
      ].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

      return {
        success: true as const,
        prNumber: pr.prNumber,
        total: comments.length,
        truncated: comments.length > MAX_COMMENTS,
        comments: comments.slice(-MAX_COMMENTS),
      };
    } catch (error) {
      return { success: false as const, error: toErrorMessage(error) };
    }
  },
});

export const githubTools = {
  github_pr_status: githubPrStatusTool,
  github_check_logs: githubCheckLogsTool,
  github_pr_comments: githubPrCommentsTool,
};
