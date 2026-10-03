import { expect, test } from "bun:test";
import {
  browserActionSchema,
  browserInspectSchema,
  browserSessionSchema,
} from "./browser-schema";
import { executeBrowser, getBrowserScope } from "./browser";

test("browser schemas exclude arbitrary scripts, external previews and unsafe protocols", () => {
  for (const url of [
    "not a URL",
    "file:///etc/passwd",
    "https://example.com",
    "http://localhost.evil.com",
    "http://user:secret@localhost:3000",
    "http://169.254.169.254",
  ]) {
    expect(
      browserSessionSchema.safeParse({ action: "open", url }).success,
    ).toBe(false);
    expect(browserInspectSchema.safeParse({ url }).success).toBe(false);
  }
  expect(
    browserSessionSchema.parse({
      action: "open",
      url: "http://localhost:3000",
    }),
  ).toMatchObject({ viewport: "desktop" });
  expect(browserInspectSchema.safeParse({ action: "click" }).success).toBe(
    false,
  );
  expect(
    browserActionSchema.safeParse({
      sessionId: crypto.randomUUID(),
      action: { kind: "evaluate", script: "alert(1)" },
    }).success,
  ).toBe(false);
});

test("browser tools fail closed without a host scope", async () => {
  expect(getBrowserScope({ browserScope: "chat:task" })).toBe("chat:task");
  expect(getBrowserScope({ browserScope: "" })).toBeUndefined();
  const output = await executeBrowser(
    "inspect",
    { url: "http://localhost:3000" },
    {},
    "call",
  );
  expect(output.success).toBe(false);
  expect(output.error).toContain("host did not supply");
});
