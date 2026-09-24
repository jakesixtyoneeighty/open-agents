import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type MojoAvatarStatus = "idle" | "online" | "thinking";

const SIZE_CLASSES = {
  xs: "size-5",
  sm: "size-7",
  md: "size-10",
  lg: "size-16",
  xl: "size-24",
} as const;

const PIXELS = { xs: 20, sm: 28, md: 40, lg: 64, xl: 96 } as const;

/**
 * Mojo's face in a gradient ring. `thinking` spins the ring, `online` adds
 * a status dot with a soft ping.
 */
export function MojoAvatar({
  size = "md",
  status = "idle",
  className,
}: {
  readonly size?: keyof typeof SIZE_CLASSES;
  readonly status?: MojoAvatarStatus;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 rounded-full",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute -inset-[2px] rounded-full bg-gradient-mojo",
          status === "thinking" && "mojo-border-spin bg-none",
        )}
      />
      <Image
        src={BRAND.assets.face}
        alt={BRAND.mascot}
        width={PIXELS[size] * 2}
        height={PIXELS[size] * 2}
        className="relative size-full rounded-full border-2 border-background object-cover"
        priority={size === "xl"}
      />
      {status === "online" && (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-3">
          <span className="mojo-ping-ring absolute inset-0 rounded-full bg-emerald-400" />
          <span className="relative size-3 rounded-full border-2 border-background bg-emerald-400" />
        </span>
      )}
    </span>
  );
}
