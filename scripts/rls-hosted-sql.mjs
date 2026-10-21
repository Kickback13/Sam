// Prints an RLS suite without the @destructive blocks (and without comment
// lines), for running on the hosted project through the Supabase MCP
// `execute_sql` tool, which pauses DELETE/TRUNCATE statements for manual
// confirmation. The removed assertions run locally against the identical schema.
//
//   node scripts/rls-hosted-sql.mjs                               # Phase 1 suite
//   node scripts/rls-hosted-sql.mjs supabase/tests/h4a_rls.sql    # Deal Engine (Phase 2A)
import { readFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? "supabase/tests/rls_isolation.sql";
const sql = readFileSync(path.resolve(new URL("..", import.meta.url).pathname, file), "utf8");
process.stdout.write(
  sql
    .replace(/^\s*-- @destructive-begin[\s\S]*?-- @destructive-end\n/gm, "")
    .replace(/^\s*--.*\n/gm, ""),
);
