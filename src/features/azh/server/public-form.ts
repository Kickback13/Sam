import "server-only";

import { cache } from "react";

import { parseBrand, type Brand } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

export type PublicForm = {
  workspaceId: string;
  name: string;
  brand: Brand;
  serviceTypes: string[];
};

/** Display data for /r/[slug] (SECURITY DEFINER RPC; null when the form is closed or not AZH). */
export const getPublicForm = cache(async (slug: string): Promise<PublicForm | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("azh_public_form", { p_slug: slug });
  if (error) {
    console.error("azh_public_form failed", { message: error.message });
    return null;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    name: row.name,
    brand: parseBrand(row.brand),
    serviceTypes: row.service_types,
  };
});
