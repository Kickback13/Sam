import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + error/help text, wired for screen readers. */
export function Field({
  id,
  label,
  error,
  help,
  className,
  children,
  required,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  help?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-brand-danger" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-brand-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-5 last:border-b-0 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
