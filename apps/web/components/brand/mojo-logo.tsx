import { useId } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The gradient "M" mark. */
export function MojoMark({ className }: { readonly className?: string }) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-7", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="3"
          y1="4"
          x2="29"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mojo-cyan)" />
          <stop offset="0.5" stopColor="var(--mojo-blue)" />
          <stop offset="1" stopColor="var(--mojo-violet)" />
        </linearGradient>
      </defs>
      <path
        d="M6 25.5V8.5L16 19.5L26 8.5V25.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + "MojoCode" wordmark. */
export function MojoLogo({
  className,
  markClassName,
  showWordmark = true,
}: {
  readonly className?: string;
  readonly markClassName?: string;
  readonly showWordmark?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      aria-label={BRAND.name}
    >
      <MojoMark className={markClassName} />
      {showWordmark && (
        <span className="font-display text-lg font-semibold leading-none tracking-tight">
          Mojo<span className="text-gradient-mojo">Code</span>
        </span>
      )}
    </span>
  );
}
