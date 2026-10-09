import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page doesn&apos;t exist, or it belongs to a workspace you don&apos;t have access to.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Go to my workspace</Link>
      </Button>
    </div>
  );
}
