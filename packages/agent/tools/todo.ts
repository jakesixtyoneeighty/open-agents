import { tool } from "ai";
import { z } from "zod";
import { todoItemSchema } from "../types";

export const todoWriteTool = tool({
  description: `Create and manage a structured task list for the current session.

WHEN TO USE:
- Complex multi-step tasks requiring 3 or more distinct steps
- When the user provides multiple requirements or a checklist
- After receiving new instructions - immediately capture them as todos
- When starting work on a task - mark that todo as in_progress BEFORE beginning
- At meaningful milestones - record completed work and the next active task

WHEN NOT TO USE:
- A single, straightforward task that can be done in one step
- Trivial tasks requiring fewer than 3 minor steps
- Purely conversational or informational queries

TASK STATES:
- "pending": Task not yet started
- "in_progress": Currently being worked on (ONLY ONE todo should be in this state at a time)
- "completed": Task finished successfully

USAGE:
- This tool REPLACES the entire todo list - always send the full, updated list of todos
- Keep the list accurate at meaningful milestones; batch related status changes in one update

IMPORTANT:
- Only one todo should be in-progress at a time; avoid parallel in-progress tasks
- Complete all required work and verification before marking its milestone completed
- Use clear, concise todo content so the list remains readable to the user`,
  inputSchema: z.object({
    todos: z
      .array(todoItemSchema)
      .describe(
        "The complete list of todo items. This replaces existing todos.",
      ),
  }),
  execute: async ({ todos }) => {
    return {
      success: true,
      message: `Updated task list with ${todos.length} items`,
      todos,
    };
  },
  // The input already contains the list. Keep the full result for the UI only.
  toModelOutput: ({ output }) => ({ type: "text", value: output.message }),
});
