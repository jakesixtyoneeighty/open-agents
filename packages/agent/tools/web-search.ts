import { tool } from "ai";
import { z } from "zod";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 1_500;

const webSearchInputSchema = z.object({
  query: z.string().min(1).describe("The search query"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of results to return (1-10). Default: 5"),
  depth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe(
      "Search depth. 'advanced' is slower but returns more relevant snippets. Default: basic",
    ),
  topic: z
    .enum(["general", "news"])
    .optional()
    .describe("Use 'news' for recent events. Default: general"),
  timeRange: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Only return results from this time window"),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Restrict results to these domains (e.g. ['nextjs.org'])"),
});

const webSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  publishedDate: z.string().optional(),
});

const webSearchOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    answer: z.string().optional(),
    results: z.array(webSearchResultSchema),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

const tavilyResponseSchema = z.object({
  answer: z.string().nullish(),
  results: z
    .array(
      z.object({
        title: z.string().nullish(),
        url: z.string(),
        content: z.string().nullish(),
        published_date: z.string().nullish(),
      }),
    )
    .default([]),
});

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export const webSearchTool = tool({
  needsApproval: false,
  description: `Search the web (via Tavily) and get ranked results with snippets.

USAGE:
- Use to find current documentation, API changes, error messages, library versions, or design references
- Returns titles, URLs, and relevant content snippets, plus a short synthesized answer when available
- Use web_fetch on a returned URL when you need the full page
- Prefer specific queries (include library names, versions, exact error text)

EXAMPLES:
- query: "Next.js 16 cache components cacheLife"
- query: "tailwind v4 @theme custom font", includeDomains: ["tailwindcss.com"]
- query: "react 20 release", topic: "news", timeRange: "month"`,
  inputSchema: webSearchInputSchema,
  outputSchema: webSearchOutputSchema,
  execute: async (
    {
      query,
      maxResults = 5,
      depth = "basic",
      topic,
      timeRange,
      includeDomains,
    },
    { abortSignal },
  ) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error:
          "Web search is not configured (TAVILY_API_KEY is not set). Do not retry; continue without web search.",
      };
    }

    const signal = abortSignal
      ? AbortSignal.any([abortSignal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS);

    try {
      const response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: depth,
          include_answer: true,
          ...(topic ? { topic } : {}),
          ...(timeRange ? { time_range: timeRange } : {}),
          ...(includeDomains?.length
            ? { include_domains: includeDomains }
            : {}),
        }),
        signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          success: false,
          error: `Web search failed (${response.status}): ${truncate(body, 300)}`,
        };
      }

      const parsed = tavilyResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return {
          success: false,
          error: "Web search returned an unexpected response",
        };
      }

      return {
        success: true,
        ...(parsed.data.answer ? { answer: parsed.data.answer } : {}),
        results: parsed.data.results.map((result) => ({
          title: result.title ?? result.url,
          url: result.url,
          content: truncate(result.content ?? "", MAX_CONTENT_LENGTH),
          ...(result.published_date
            ? { publishedDate: result.published_date }
            : {}),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Web search failed: ${message}` };
    }
  },
});
