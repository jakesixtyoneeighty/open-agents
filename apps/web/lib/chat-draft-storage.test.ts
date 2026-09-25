import { describe, expect, test } from "bun:test";
import {
  clearChatDraft,
  type DraftStorage,
  readChatDraft,
  resolveDraftSubmission,
  writeChatDraft,
} from "./chat-draft-storage";

function createMemoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("chat draft storage", () => {
  test("keeps drafts separate per chat", () => {
    const storage = createMemoryStorage();
    writeChatDraft(storage, "chat-a", "first draft");
    writeChatDraft(storage, "chat-b", "second draft");

    expect(readChatDraft(storage, "chat-a")).toBe("first draft");
    expect(readChatDraft(storage, "chat-b")).toBe("second draft");
  });

  test("removes the entry when the draft becomes empty", () => {
    const storage = createMemoryStorage();
    writeChatDraft(storage, "chat-a", "text");
    writeChatDraft(storage, "chat-a", "");

    expect(readChatDraft(storage, "chat-a")).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  test("clearChatDraft removes only that chat", () => {
    const storage = createMemoryStorage();
    writeChatDraft(storage, "chat-a", "a");
    writeChatDraft(storage, "chat-b", "b");
    clearChatDraft(storage, "chat-a");

    expect(readChatDraft(storage, "chat-a")).toBeNull();
    expect(readChatDraft(storage, "chat-b")).toBe("b");
  });

  test("tolerates missing or throwing storage", () => {
    const throwing: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readChatDraft(null, "chat-a")).toBeNull();
    expect(readChatDraft(throwing, "chat-a")).toBeNull();
    expect(() => writeChatDraft(throwing, "chat-a", "x")).not.toThrow();
    expect(() => writeChatDraft(null, "chat-a", "x")).not.toThrow();
  });
});

describe("resolveDraftSubmission", () => {
  test("stays pending until the request is in flight", () => {
    expect(resolveDraftSubmission("ready", false)).toBe("pending");
    expect(resolveDraftSubmission("submitted", true)).toBe("pending");
  });

  test("accepts once the server streams a response", () => {
    expect(resolveDraftSubmission("streaming", true)).toBe("accepted");
  });

  test("accepts when a fast request settles back to ready", () => {
    expect(resolveDraftSubmission("ready", true)).toBe("accepted");
  });

  test("fails on error so the draft can be restored", () => {
    expect(resolveDraftSubmission("error", true)).toBe("failed");
  });

  test("ignores an error left over from a previous turn", () => {
    expect(resolveDraftSubmission("error", false)).toBe("pending");
  });
});
