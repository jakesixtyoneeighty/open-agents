import { expect, test } from "bun:test";
import { parseChatRequestBody } from "./request";

function request(data: unknown, role = "user") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ id: "1", role, parts: [{ type: "data-task-brief", data }] }],
    }),
  });
}

test("accepts and normalizes an optional brief", async () => {
  const result = await parseChatRequestBody(
    request({ action: "plan", brief: { goal: "  Add search  " } }),
  );
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.body.messages[0]?.parts[0]).toMatchObject({
      data: { brief: { goal: "Add search", audience: "" } },
    });
});

test("rejects malformed briefs and assistant-authored mode switches", async () => {
  for (const req of [
    request({ action: "plan", brief: { goal: "" } }),
    request({ action: "build", brief: { goal: "x" } }, "assistant"),
    request({ action: "publish", brief: { goal: "x" } }),
    request({
      action: "plan",
      brief: { goal: "x", constraints: "x".repeat(3001) },
    }),
  ]) {
    const result = await parseChatRequestBody(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  }
});
