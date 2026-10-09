"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  brandContrastIssues,
  brandCssVars,
  contrastRatio,
  FONTS,
  type Brand,
  type FontKey,
} from "@/lib/brand";
import type { FieldErrors } from "@/lib/validation/common";
import { updateBranding, updateWorkspaceProfile } from "@/server/actions/settings";

export function WorkspaceProfileForm({
  initial,
}: {
  initial: {
    name: string;
    legal_name: string;
    license: string;
    phone: string;
    address: string;
    owner_email: string;
  };
}) {
  const ws = useWorkspace();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const disabled = !ws.isAdmin;
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updateWorkspaceProfile({ workspaceId: ws.id, ...v });
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                toast.error(r.error);
                return;
              }
              setErrors({});
              toast.success("Workspace saved");
            });
          }}
        >
          <Field id="ws-name" label="Display name" error={errors.name?.[0]}>
            <Input
              id="ws-name"
              disabled={disabled}
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field id="ws-legal" label="Legal name">
            <Input
              id="ws-legal"
              disabled={disabled}
              value={v.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
            />
          </Field>
          <Field id="ws-license" label="License #">
            <Input
              id="ws-license"
              disabled={disabled}
              value={v.license}
              onChange={(e) => set("license", e.target.value)}
              placeholder="e.g. DRE #01735348"
            />
          </Field>
          <Field id="ws-phone" label="Main phone">
            <Input
              id="ws-phone"
              disabled={disabled}
              value={v.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field id="ws-address" label="Office address" className="sm:col-span-2">
            <Input
              id="ws-address"
              disabled={disabled}
              value={v.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <Field
            id="ws-owner-email"
            label="Owner email (Sam's account for this business)"
            error={errors.owner_email?.[0]}
            help="Third-party accounts for this workspace will live under this email."
            className="sm:col-span-2"
          >
            <Input
              id="ws-owner-email"
              type="email"
              disabled={disabled}
              value={v.owner_email}
              onChange={(e) => set("owner_email", e.target.value)}
            />
          </Field>
          {!disabled && (
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save profile
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

const COLOR_FIELDS: { key: keyof Brand; label: string; help: string }[] = [
  { key: "primary", label: "Primary", help: "Headers, avatars, charts (white text on top)" },
  { key: "primaryDeep", label: "Primary deep", help: "Hover/pressed primary" },
  { key: "accent", label: "Accent (fill)", help: "Buttons and badges — black text on top" },
  { key: "accentText", label: "Accent text", help: "Colored links/text on white" },
  { key: "danger", label: "Danger", help: "Errors and destructive actions" },
  { key: "ink", label: "Ink", help: "Body text" },
  { key: "surface", label: "Surface tint", help: "Page background tint" },
];

export function BrandingForm({ initial }: { initial: Brand }) {
  const ws = useWorkspace();
  const [brand, setBrand] = useState<Brand>(initial);
  const [pending, start] = useTransition();
  const disabled = !ws.isAdmin;
  const valid = Object.values(brand).every(
    (v) => typeof v !== "string" || !v.startsWith("#") || /^#[0-9a-fA-F]{6}$/.test(v),
  );
  const issues = useMemo(
    () => (valid ? brandContrastIssues(brand) : ["Use 6-digit hex colors"]),
    [brand, valid],
  );
  const preview = valid ? (brandCssVars(brand) as React.CSSProperties) : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <p className="text-sm text-muted-foreground">
          Applied across the app for everyone in this workspace. Must pass WCAG AA contrast.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updateBranding({ workspaceId: ws.id, brand });
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Branding saved — the app has been re-skinned");
            });
          }}
        >
          {COLOR_FIELDS.map((f) => (
            <Field key={f.key} id={`brand-${f.key}`} label={f.label} help={f.help}>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label={`${f.label} color picker`}
                  disabled={disabled}
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(String(brand[f.key]))
                      ? String(brand[f.key])
                      : "#000000"
                  }
                  onChange={(e) => setBrand({ ...brand, [f.key]: e.target.value.toUpperCase() })}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                />
                <Input
                  id={`brand-${f.key}`}
                  disabled={disabled}
                  value={String(brand[f.key])}
                  onChange={(e) => setBrand({ ...brand, [f.key]: e.target.value.trim() })}
                  className="font-mono uppercase"
                />
              </div>
            </Field>
          ))}
          <Field id="brand-display" label="Display font">
            <NativeSelect
              id="brand-display"
              disabled={disabled}
              value={brand.displayFont}
              onChange={(e) => setBrand({ ...brand, displayFont: e.target.value as FontKey })}
            >
              {Object.entries(FONTS).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="brand-body" label="Body font">
            <NativeSelect
              id="brand-body"
              disabled={disabled}
              value={brand.bodyFont}
              onChange={(e) => setBrand({ ...brand, bodyFont: e.target.value as FontKey })}
            >
              {Object.entries(FONTS).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="brand-logo"
            label="Logo text"
            help="Up to 6 characters, shown in the sidebar badge"
          >
            <Input
              id="brand-logo"
              disabled={disabled}
              maxLength={6}
              value={brand.logoText ?? ""}
              onChange={(e) => setBrand({ ...brand, logoText: e.target.value })}
            />
          </Field>
          {!disabled && (
            <div className="flex items-end justify-end sm:col-span-2">
              <Button type="submit" disabled={pending || issues.length > 0}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save branding
              </Button>
            </div>
          )}
        </form>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Preview</p>
          <div style={preview} className="overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 bg-[#0B0C10] px-3 py-2.5">
              <span
                className="flex size-7 items-center justify-center rounded-md text-[9px] font-extrabold text-black"
                style={{ backgroundColor: brand.accent }}
              >
                {brand.logoText || "LOGO"}
              </span>
              <span
                className="text-sm font-bold text-white"
                style={{ fontFamily: "var(--brand-font-display)" }}
              >
                {ws.name}
              </span>
            </div>
            <div
              className="space-y-2 p-3"
              style={{
                backgroundColor: brand.surface,
                color: brand.ink,
                fontFamily: "var(--brand-font-body)",
              }}
            >
              <p className="text-lg font-bold" style={{ fontFamily: "var(--brand-font-display)" }}>
                Heading text
              </p>
              <p className="text-sm">
                Body copy with a{" "}
                <span className="font-semibold underline" style={{ color: brand.accentText }}>
                  colored link
                </span>
                .
              </p>
              <div className="flex gap-2">
                <span
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-black"
                  style={{ backgroundColor: brand.accent }}
                >
                  Primary action
                </span>
                <span
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: brand.primary }}
                >
                  Primary
                </span>
              </div>
            </div>
          </div>
          <ul className="space-y-1 text-xs" aria-live="polite">
            {valid &&
              [
                ["Black on accent", contrastRatio("#000000", brand.accent)],
                ["Accent text on white", contrastRatio(brand.accentText, "#FFFFFF")],
                ["White on primary", contrastRatio("#FFFFFF", brand.primary)],
              ].map(([label, ratio]) => (
                <li key={label as string} className="flex items-center gap-1.5">
                  {(ratio as number) >= 4.5 ? (
                    <Check className="size-3.5 text-emerald-700" aria-hidden />
                  ) : (
                    <TriangleAlert className="size-3.5 text-brand-danger" aria-hidden />
                  )}
                  {label}: {(ratio as number).toFixed(1)}:1
                </li>
              ))}
            {issues.map((i) => (
              <li key={i} role="alert" className="font-semibold text-brand-danger">
                {i}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
