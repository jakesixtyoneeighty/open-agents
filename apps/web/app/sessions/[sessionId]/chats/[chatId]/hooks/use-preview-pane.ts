"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PreviewViewportId } from "@/lib/preview/preview-frame";
import type { DevServerLaunchState } from "./use-dev-server";

export interface PreviewPaneControls {
  isOpen: boolean;
  url: string | null;
  viewportId: PreviewViewportId;
  reloadKey: number;
  handleOpen: () => void;
  handleClose: () => void;
  handleToggle: () => void;
  handleReload: () => void;
  handleViewportChange: (id: PreviewViewportId) => void;
}

/**
 * Preview pane state for the session's dev server. It opens by itself when a
 * start the user requested finishes, and closes when the server stops.
 */
export function usePreviewPane(
  devServerState: DevServerLaunchState,
): PreviewPaneControls {
  const [isOpen, setIsOpen] = useState(false);
  const [viewportId, setViewportId] = useState<PreviewViewportId>("fit");
  const [reloadKey, setReloadKey] = useState(0);
  const previousStatusRef = useRef(devServerState.status);

  const url =
    devServerState.status === "ready" ? devServerState.info.url : null;

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = devServerState.status;
    if (devServerState.status === "ready" && previous === "starting") {
      setIsOpen(true);
    } else if (devServerState.status !== "ready") {
      setIsOpen(false);
    }
  }, [devServerState.status]);

  const handleOpen = useCallback(() => {
    if (url) setIsOpen(true);
  }, [url]);
  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleToggle = useCallback(() => {
    if (url) setIsOpen((prev) => !prev);
  }, [url]);
  const handleReload = useCallback(() => setReloadKey((key) => key + 1), []);

  return {
    isOpen: isOpen && url !== null,
    url,
    viewportId,
    reloadKey,
    handleOpen,
    handleClose,
    handleToggle,
    handleReload,
    handleViewportChange: setViewportId,
  };
}
