"use client";

import { createContext, useContext, type ReactNode } from "react";

type ScreenshotUrlResolver = (imageId: string) => string;

const ScreenshotSourceContext = createContext<ScreenshotUrlResolver | null>(
  null,
);

/**
 * Tells gallery images where to load from: the owner route inside a session,
 * or the share-scoped route on shared pages. Without a provider, galleries
 * show capture details but no images.
 */
export function ScreenshotSourceProvider({
  source,
  children,
}: {
  source: { sessionId: string } | { shareId: string };
  children: ReactNode;
}) {
  const resolve: ScreenshotUrlResolver =
    "sessionId" in source
      ? (imageId) =>
          `/api/sessions/${encodeURIComponent(source.sessionId)}/screenshots/${encodeURIComponent(imageId)}`
      : (imageId) =>
          `/api/shared/${encodeURIComponent(source.shareId)}/screenshots/${encodeURIComponent(imageId)}`;

  return (
    <ScreenshotSourceContext.Provider value={resolve}>
      {children}
    </ScreenshotSourceContext.Provider>
  );
}

export function useScreenshotUrl(): ScreenshotUrlResolver | null {
  return useContext(ScreenshotSourceContext);
}
