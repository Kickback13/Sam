import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Initials avatar (no remote images in Phase 1). */
function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export { Avatar };
