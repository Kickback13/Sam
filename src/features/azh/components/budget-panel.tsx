"use client";

import { Check, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, todayInAppTz } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  adjustedContract,
  approvedChangeOrderTotal,
  budgetVsActual,
  pendingChangeOrderTotal,
} from "../budget/math";
import { formatMoney } from "../format";
import {
  addBudgetLine,
  addChangeOrder,
  addCost,
  deleteBudgetLine,
  deleteChangeOrder,
  deleteCost,
  setChangeOrderStatus,
  updateBudgetLine,
} from "../server/actions/budget";
import type { BudgetData } from "../server/queries";
import { uploadAzhFile } from "./files-panel";

type Result = { ok: boolean; error?: string };

export function BudgetPanel({
  dealId,
  contractValue,
  budget,
  receiptUrls,
}: {
  dealId: string;
  contractValue: number | null;
  budget: BudgetData;
  receiptUrls: Record<string, string>;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const summary = budgetVsActual(budget.lines, budget.costs);
  const approved = approvedChangeOrderTotal(budget.orders);
  const pendingCo = pendingChangeOrderTotal(budget.orders);
  const adjusted = adjustedContract(contractValue, budget.orders);
  const categories = [
    ...new Set([...budget.lines.map((l) => l.category), ...budget.costs.map((c) => c.category)]),
  ];

  function run(fn: () => Promise<Result>, msg: string, after?: () => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong");
        return;
      }
      toast.success(msg);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-testid="budget">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Contract value"
          value={formatMoney(adjusted)}
          sub={
            contractValue === null
              ? "Set it on Overview"
              : approved
                ? `${formatMoney(contractValue)} + ${formatMoney(approved)} approved COs`
                : "No approved change orders"
          }
          testId="stat-contract"
        />
        <Stat label="Budget" value={formatMoney(summary.totals.budgeted)} testId="stat-budget" />
        <Stat
          label="Actual cost"
          value={formatMoney(summary.totals.actual)}
          sub={summary.totals.pctUsed === null ? undefined : `${summary.totals.pctUsed}% of budget`}
          testId="stat-actual"
        />
        <Stat
          label="Variance"
          value={formatMoney(summary.totals.variance)}
          sub={summary.totals.variance < 0 ? "Over budget" : "Under budget"}
          tone={summary.totals.variance < 0 ? "bad" : "good"}
          testId="stat-variance"
        />
      </section>

      <section
        className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
        aria-label="Budget vs actual"
      >
        <h2 className="text-base font-bold">Budget vs. actual</h2>
        {summary.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No budget lines yet. Add categories like Framing, Drywall, Permits.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm" data-testid="variance-table">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-1 font-semibold">Category</th>
                  <th className="py-1 text-right font-semibold">Budgeted</th>
                  <th className="py-1 text-right font-semibold">Actual</th>
                  <th className="py-1 text-right font-semibold">Variance</th>
                  <th className="py-1 text-right font-semibold">Used</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.rows.map((row) => {
                  const line = budget.lines.find((l) => l.category === row.category);
                  return (
                    <tr key={row.category} data-testid="variance-row">
                      <td className="py-1.5 font-semibold">
                        {row.category}
                        {!line && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (not budgeted)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        {line && ws.canWrite ? (
                          <Input
                            aria-label={`Budget for ${row.category}`}
                            inputMode="decimal"
                            className="ml-auto h-8 w-28 text-right"
                            defaultValue={String(line.budgeted)}
                            onBlur={(e) => {
                              if (
                                Number(e.target.value.replace(/[$,]/g, "")) !==
                                Number(line.budgeted)
                              )
                                run(
                                  () =>
                                    updateBudgetLine({
                                      workspaceId: ws.id,
                                      id: line.id,
                                      budgeted: e.target.value,
                                    }),
                                  "Budget updated",
                                );
                            }}
                          />
                        ) : (
                          <span className="tabular">{formatMoney(row.budgeted)}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular">{formatMoney(row.actual)}</td>
                      <td
                        className={cn(
                          "py-1.5 text-right font-semibold tabular",
                          row.variance < 0 ? "text-brand-danger" : "text-emerald-800",
                        )}
                      >
                        {formatMoney(row.variance)}
                      </td>
                      <td className="py-1.5 text-right tabular">
                        {row.pctUsed === null ? "—" : `${row.pctUsed}%`}
                      </td>
                      <td className="py-1.5 text-right">
                        {line && ws.canWrite && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete budget line ${row.category}`}
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => deleteBudgetLine({ workspaceId: ws.id, id: line.id }),
                                "Budget line deleted",
                              )
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 font-bold">
                <tr>
                  <td className="py-1.5">Total</td>
                  <td className="py-1.5 text-right tabular">
                    {formatMoney(summary.totals.budgeted)}
                  </td>
                  <td className="py-1.5 text-right tabular">
                    {formatMoney(summary.totals.actual)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular",
                      summary.totals.variance < 0 ? "text-brand-danger" : "text-emerald-800",
                    )}
                    data-testid="variance-total"
                  >
                    {formatMoney(summary.totals.variance)}
                  </td>
                  <td className="py-1.5 text-right tabular">
                    {summary.totals.pctUsed === null ? "—" : `${summary.totals.pctUsed}%`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {ws.canWrite && <AddBudgetLine dealId={dealId} run={run} pending={pending} />}
      </section>

      <CostsSection
        dealId={dealId}
        budget={budget}
        categories={categories}
        receiptUrls={receiptUrls}
        run={run}
        pending={pending}
      />

      <section
        className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
        aria-label="Change orders"
        data-testid="change-orders"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">Change orders</h2>
          <span className="text-sm text-muted-foreground">
            Approved {formatMoney(approved)} · pending {formatMoney(pendingCo)}
          </span>
        </div>
        {budget.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No change orders. Approved ones add to the contract value.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {budget.orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                data-testid="change-order-row"
              >
                <span className="w-10 font-semibold text-muted-foreground tabular">
                  #{o.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{o.description}</span>
                  {o.decided_on && (
                    <span className="text-xs text-muted-foreground">
                      {o.status === "approved" ? "Approved" : "Declined"} {formatDate(o.decided_on)}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "font-semibold tabular",
                    Number(o.amount) < 0 && "text-brand-danger",
                  )}
                >
                  {formatMoney(o.amount)}
                </span>
                <Badge
                  variant={
                    o.status === "approved"
                      ? "success"
                      : o.status === "declined"
                        ? "danger"
                        : "warning"
                  }
                >
                  {o.status}
                </Badge>
                {ws.canWrite && o.status === "pending" && (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            setChangeOrderStatus({
                              workspaceId: ws.id,
                              id: o.id,
                              status: "approved",
                            }),
                          `Change order #${o.number} approved`,
                        )
                      }
                    >
                      <Check aria-hidden /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            setChangeOrderStatus({
                              workspaceId: ws.id,
                              id: o.id,
                              status: "declined",
                            }),
                          `Change order #${o.number} declined`,
                        )
                      }
                    >
                      <X aria-hidden /> Decline
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete change order ${o.number}`}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => deleteChangeOrder({ workspaceId: ws.id, id: o.id }),
                          "Change order deleted",
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                )}
                {ws.canWrite && o.status !== "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          setChangeOrderStatus({ workspaceId: ws.id, id: o.id, status: "pending" }),
                        "Moved back to pending",
                      )
                    }
                  >
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {ws.canWrite && <AddChangeOrder dealId={dealId} run={run} pending={pending} />}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
  testId: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3" data-testid={testId}>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-xl font-bold tabular",
          tone === "bad" && "text-brand-danger",
        )}
        data-testid={`${testId}-value`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

type Run = (fn: () => Promise<Result>, msg: string, after?: () => void) => void;

function AddBudgetLine({ dealId, run, pending }: { dealId: string; run: Run; pending: boolean }) {
  const ws = useWorkspace();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addBudgetLine({ workspaceId: ws.id, dealId, line: { category, budgeted: amount } }),
          "Budget line added",
          () => {
            setCategory("");
            setAmount("");
          },
        );
      }}
    >
      <Input
        aria-label="Budget category"
        placeholder="Category (e.g. Framing)"
        className="min-w-40 flex-1"
        maxLength={60}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      />
      <Input
        aria-label="Budgeted amount"
        placeholder="$0.00"
        inputMode="decimal"
        className="w-32"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={pending || !category.trim()}
        data-testid="add-budget-line"
      >
        <Plus aria-hidden /> Add line
      </Button>
    </form>
  );
}

function AddChangeOrder({ dealId, run, pending }: { dealId: string; run: Run; pending: boolean }) {
  const ws = useWorkspace();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            addChangeOrder({
              workspaceId: ws.id,
              dealId,
              order: { description, amount, status: "pending" },
            }),
          "Change order added",
          () => {
            setDescription("");
            setAmount("");
          },
        );
      }}
    >
      <Input
        aria-label="Change order description"
        placeholder="What changed?"
        className="min-w-48 flex-1"
        maxLength={1000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        aria-label="Change order amount"
        placeholder="$0.00 (− for credit)"
        inputMode="decimal"
        className="w-40"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={pending || !description.trim() || !amount.trim()}
        data-testid="add-change-order"
      >
        <Plus aria-hidden /> Add change order
      </Button>
    </form>
  );
}

function CostsSection({
  dealId,
  budget,
  categories,
  receiptUrls,
  run,
  pending,
}: {
  dealId: string;
  budget: BudgetData;
  categories: string[];
  receiptUrls: Record<string, string>;
  run: Run;
  pending: boolean;
}) {
  const ws = useWorkspace();
  const blank = () => ({
    spent_on: todayInAppTz(),
    vendor: "",
    amount: "",
    category: categories[0] ?? "",
    notes: "",
  });
  const [v, setV] = useState(blank);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let receiptId: string | null = null;
    if (receipt) {
      setUploading(true);
      try {
        receiptId = await uploadAzhFile(ws.id, { dealId }, receipt, "receipt");
      } catch (err) {
        setUploading(false);
        toast.error(err instanceof Error ? err.message : "Receipt upload failed");
        return;
      }
      setUploading(false);
    }
    run(
      () => addCost({ workspaceId: ws.id, dealId, cost: { ...v, receipt_file_id: receiptId } }),
      "Cost added",
      () => {
        setV(blank());
        setReceipt(null);
        if (fileRef.current) fileRef.current.value = "";
      },
    );
  }

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Costs"
      data-testid="costs"
    >
      <h2 className="text-base font-bold">Costs</h2>
      {budget.costs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No costs recorded yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {budget.costs.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
              data-testid="cost-row"
            >
              <span className="w-24 text-xs text-muted-foreground tabular">
                {formatDate(c.spent_on)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.vendor || "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {c.category}
                  {c.notes ? ` · ${c.notes}` : ""}
                </span>
              </span>
              {c.receipt && (
                <a
                  href={receiptUrls[c.receipt.path] ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent-text hover:underline"
                >
                  <Paperclip className="size-3" aria-hidden /> Receipt
                </a>
              )}
              <span className="font-semibold tabular">{formatMoney(c.amount)}</span>
              {ws.canWrite && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete cost ${c.vendor ?? c.category} ${formatMoney(c.amount)}`}
                  disabled={pending}
                  onClick={() =>
                    run(() => deleteCost({ workspaceId: ws.id, id: c.id }), "Cost deleted")
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ws.canWrite && (
        <form className="grid gap-2 sm:grid-cols-6" onSubmit={submit}>
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="cost-date" className="text-xs">
              Date
            </Label>
            <Input
              id="cost-date"
              type="date"
              value={v.spent_on}
              onChange={(e) => setV((p) => ({ ...p, spent_on: e.target.value }))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="cost-vendor" className="text-xs">
              Vendor
            </Label>
            <Input
              id="cost-vendor"
              maxLength={120}
              value={v.vendor}
              onChange={(e) => setV((p) => ({ ...p, vendor: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cost-amount" className="text-xs">
              Amount
            </Label>
            <Input
              id="cost-amount"
              inputMode="decimal"
              placeholder="$0.00"
              value={v.amount}
              onChange={(e) => setV((p) => ({ ...p, amount: e.target.value }))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="cost-category" className="text-xs">
              Category
            </Label>
            <Input
              id="cost-category"
              list="cost-categories"
              maxLength={60}
              value={v.category}
              onChange={(e) => setV((p) => ({ ...p, category: e.target.value }))}
            />
            <datalist id="cost-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="cost-notes" className="text-xs">
              Notes
            </Label>
            <Input
              id="cost-notes"
              maxLength={1000}
              value={v.notes}
              onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="cost-receipt" className="text-xs">
              Receipt (optional)
            </Label>
            <Input
              id="cost-receipt"
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={pending || uploading || !v.amount.trim() || !v.category.trim()}
              data-testid="add-cost"
            >
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}{" "}
              Add cost
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
