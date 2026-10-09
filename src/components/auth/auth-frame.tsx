import { Building2, HardHat } from "lucide-react";

export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section
        aria-hidden
        className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-sidebar-muted">
          <span className="inline-block size-2 rounded-full bg-[#00D9E1]" />
          Housing4All Platform
        </div>
        <div className="space-y-6">
          <p className="max-w-md font-display text-3xl leading-tight font-bold text-white">
            Find, verify and close — every number with its source.
          </p>
          <ul className="space-y-3 text-sm text-sidebar-muted">
            <li className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-md bg-[#00D9E1] text-black">
                <Building2 className="size-4" />
              </span>
              Housing4All Premier Solutions · DRE #01735348
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-md bg-[#FFC20E] text-black">
                <HardHat className="size-4" />
              </span>
              AZH Builders · San Diego & Fallbrook
            </li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">San Diego, California</p>
      </section>
      <section className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
