import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { ChatOutcome } from "../chat/outcome";

let values: unknown;
let condition: SQL;
let updated = true;
mock.module("./client", () => ({
  db: {
    update: () => ({
      set: (input: unknown) => {
        values = input;
        return {
          where: (where: SQL) => {
            condition = where;
            return {
              returning: async () => (updated ? [{ id: "chat-1" }] : []),
            };
          },
        };
      },
    }),
  },
}));
const { compareAndSetChatActiveStreamId } = await import("./sessions");
const outcome: ChatOutcome = {
  runId: "run-1",
  chatId: "chat-1",
  status: "failed",
  finishedAt: "2026-09-25T00:00:00.000Z",
};
beforeEach(() => {
  updated = true;
});
test("outcome and stream release share one ownership-guarded update", async () => {
  expect(
    await compareAndSetChatActiveStreamId("chat-1", "run-1", null, outcome),
  ).toBe(true);
  expect(values).toEqual({ activeStreamId: null, lastOutcome: outcome });
  const query = new PgDialect().sqlToQuery(condition);
  expect(query.sql).toContain('"chats"."active_stream_id" =');
  expect(query.params).toEqual(["chat-1", "run-1"]);
});
test("a stale run cannot publish an outcome after losing ownership", async () => {
  updated = false;
  expect(
    await compareAndSetChatActiveStreamId("chat-1", "run-1", null, outcome),
  ).toBe(false);
});
test("stream claims preserve the last outcome for alerts between polls", async () => {
  await compareAndSetChatActiveStreamId("chat-1", null, "run-2");
  expect(values).toEqual({ activeStreamId: "run-2" });
  expect(new PgDialect().sqlToQuery(condition).sql).toContain(
    '"chats"."active_stream_id" is null',
  );
});
