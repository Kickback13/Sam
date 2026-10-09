import { CheckCircle2, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ComingSoonModule } from "@/lib/nav";

export function ComingSoon({ module }: { module: ComingSoonModule }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold sm:text-[28px]">{module.title}</h1>
        <Badge variant="outline">
          <Clock aria-hidden /> Coming in Phase {module.phase}
        </Badge>
      </div>
      <Card>
        <CardContent className="space-y-4 py-6">
          <p className="text-base">{module.summary}</p>
          <ul className="space-y-2">
            {module.bullets.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-muted-foreground">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-brand-accent-text"
                  aria-hidden
                />
                {b}
              </li>
            ))}
          </ul>
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            <strong>Not connected yet.</strong> Nothing on this page is simulated — it switches on
            when Phase {module.phase} ships.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
