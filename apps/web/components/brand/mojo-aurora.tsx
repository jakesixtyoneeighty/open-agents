import { cn } from "@/lib/utils";

/**
 * Decorative drifting gradient blobs + dot grid. Sits behind content; place
 * inside a `relative` (or `fixed`) container.
 */
export function MojoAurora({
  className,
  intensity = "normal",
  grid = true,
}: {
  readonly className?: string;
  readonly intensity?: "subtle" | "normal" | "vivid";
  readonly grid?: boolean;
}) {
  const opacity =
    intensity === "subtle"
      ? "opacity-40 dark:opacity-50"
      : intensity === "vivid"
        ? "opacity-80 dark:opacity-100"
        : "opacity-60 dark:opacity-75";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <div className={cn("absolute inset-0", opacity)}>
        <div className="mojo-aurora-blob-a absolute -left-[10%] -top-[20%] h-[60%] w-[55%] rounded-full bg-mojo-cyan/30 blur-[110px]" />
        <div className="mojo-aurora-blob-b absolute -right-[10%] top-[5%] h-[65%] w-[50%] rounded-full bg-mojo-violet/30 blur-[120px]" />
        <div className="mojo-aurora-blob-a absolute bottom-[-25%] left-[25%] h-[55%] w-[50%] rounded-full bg-mojo-blue/25 blur-[120px] [animation-delay:-9s]" />
      </div>
      {grid && (
        <div className="mojo-dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      )}
    </div>
  );
}
