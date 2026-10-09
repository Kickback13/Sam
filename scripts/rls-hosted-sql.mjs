// Prints the RLS isolation suite without the @destructive blocks (and without
// comment lines), for running on the hosted project through the Supabase MCP
// `execute_sql` tool, which pauses DELETE/TRUNCATE statements for manual
// confirmation. The removed assertions run locally against the identical schema.
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/tests/rls_isolation.sql", import.meta.url), "utf8");
process.stdout.write(
  sql
    .replace(/^\s*-- @destructive-begin[\s\S]*?-- @destructive-end\n/gm, "")
    .replace(/^\s*--.*\n/gm, ""),
);
