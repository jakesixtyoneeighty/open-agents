import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { BrowserRenderer } from "./browser-renderer";

const state = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};
test("inspection does not claim interaction success; failed browser calls show an error", () => {
  const part: ToolRendererProps<"tool-browser_inspect">["part"] = {
    type: "tool-browser_inspect",
    toolCallId: "inspect",
    state: "output-available",
    input: { url: "http://localhost:3000", viewport: "mobile" },
    output: { success: true, snapshot: "Preview" },
  };
  const html = renderToStaticMarkup(
    <BrowserRenderer part={part} state={state} />,
  );
  expect(html).toContain("Inspection only");
  expect(html).not.toContain("passed");
  const failed = renderToStaticMarkup(
    <BrowserRenderer
      part={{
        ...part,
        output: { success: false, error: "Browser session expired" },
      }}
      state={state}
    />,
  );
  expect(failed).toContain("Failed");
  expect(failed).not.toContain("completed");
});
