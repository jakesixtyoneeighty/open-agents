"use client";

import { History, Trash2 } from "lucide-react";
import type { SessionChatListItem } from "@/hooks/use-session-chats";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ClosedChatsMenuProps = {
  closedChats: SessionChatListItem[];
  onReopen: (chatId: string) => void;
  onRequestDelete: (chatId: string) => void;
};

/**
 * Lists chats whose tabs were closed. Selecting one reopens it; deleting is a
 * separate, explicit action.
 */
export function ClosedChatsMenu({
  closedChats,
  onReopen,
  onRequestDelete,
}: ClosedChatsMenuProps) {
  if (closedChats.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Closed chats (${closedChats.length})`}
              className="flex shrink-0 items-center gap-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" />
              <span className="text-xs tabular-nums">{closedChats.length}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Closed chats</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Closed chats
        </DropdownMenuLabel>
        {closedChats.map((chat) => (
          <div key={chat.id} className="flex items-center gap-1">
            <DropdownMenuItem
              onSelect={() => onReopen(chat.id)}
              className="min-w-0 flex-1"
            >
              <span className="truncate">{chat.title || "New Chat"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-label={`Delete ${chat.title || "chat"} permanently`}
              onSelect={() => onRequestDelete(chat.id)}
              className="shrink-0 text-muted-foreground focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
