"use client";

import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/use-hydrated";

import { CONTACT_TIMES, INTAKE_PHOTO_TYPES, MAX_FILE_BYTES, MAX_INTAKE_PHOTOS } from "../constants";
import { DICTS, type Lang } from "../intake/i18n";
import type { UploadResponse } from "../intake/upload-schema";
import { submitIntake } from "../server/actions/intake";

type Photo = { file: File; url: string; ext: string; type: string };
type FieldKey =
  "name" | "phone" | "email" | "job_address" | "job_zip" | "service_type" | "description";

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

function photoInfo(file: File): { ext: string; type: string } | null {
  const fromType = INTAKE_PHOTO_TYPES[file.type];
  if (fromType) return { ext: fromType, type: file.type };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ? { ext: ext === "jpeg" ? "jpg" : ext, type: EXT_TYPES[ext] } : null;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={`${id}-error`} className="text-sm font-medium text-brand-danger">
      {message}
    </p>
  ) : null;
}

function Req() {
  return (
    <span className="text-brand-danger" aria-hidden>
      {" "}
      *
    </span>
  );
}

export function RequestForm({
  slug,
  lang,
  serviceTypes,
  thanksPath,
}: {
  slug: string;
  lang: Lang;
  serviceTypes: string[];
  thanksPath: string;
}) {
  const t = DICTS[lang];
  const router = useRouter();
  const hydrated = useHydrated();
  const [values, setValues] = useState({
    name: "",
    phone: "",
    email: "",
    job_address: "",
    job_zip: "",
    service_type: "",
    description: "",
    preferred_contact_time: "any" as (typeof CONTACT_TIMES)[number],
    website: "",
  });
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");
  const fileInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Revoke preview URLs when photos are removed or the form unmounts.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  function addPhotos(list: FileList | null) {
    if (!list) return;
    setPhotoError(null);
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_INTAKE_PHOTOS) {
        setPhotoError(t.errors.photoCount);
        break;
      }
      const info = photoInfo(file);
      if (!info) {
        setPhotoError(t.errors.photoType);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setPhotoError(t.errors.photoSize);
        continue;
      }
      next.push({ file, url: URL.createObjectURL(file), ...info });
    }
    setPhotos(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(photos[i].url);
    setPhotos((p) => p.filter((_, j) => j !== i));
    setPhotoError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    let photoPaths: string[] = [];
    if (photos.length) {
      setPhase("uploading");
      const failed = (key: keyof typeof t.errors, field?: FieldKey) => {
        setPhase("idle");
        if (field) setFieldErrors({ [field]: t.errors[key] });
        setFormError(field ? t.errors.fix : t.errors[key]);
        requestAnimationFrame(() => errorRef.current?.focus());
      };
      try {
        // 1) Ask our server for upload slots (validates + rate-limits), 2) upload to those signed URLs.
        const res = await fetch(`/r/${slug}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: values.phone,
            files: photos.map((p) => ({ type: p.type, size: p.file.size })),
          }),
        });
        const body = (await res.json()) as UploadResponse;
        if (!body.ok) {
          if (body.error === "phone") return failed("phone", "phone");
          return failed(body.error);
        }
        const supabase = createClient();
        photoPaths = await Promise.all(
          body.slots.map(async (slot, i) => {
            const { error } = await supabase.storage
              .from("azh-intake")
              .uploadToSignedUrl(slot.path, slot.token, photos[i].file, {
                contentType: photos[i].type,
              });
            if (error) throw error;
            return slot.path;
          }),
        );
      } catch {
        return failed("photoUpload");
      }
    }

    setPhase("sending");
    const result = await submitIntake({
      ...values,
      slug,
      lang,
      photo_paths: photoPaths,
      sms_consent: consent,
    });
    if (result.ok) {
      router.push(thanksPath);
      return;
    }
    setPhase("idle");
    if (result.fields) {
      const fe: Partial<Record<FieldKey, string>> = {};
      for (const [k, msg] of Object.entries(result.fields))
        fe[k as FieldKey] = t.errors[msg as keyof typeof t.errors] ?? t.errors.generic;
      setFieldErrors(fe);
    }
    setFormError(t.errors[result.error] ?? t.errors.generic);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  const busy = phase !== "idle";
  const describe = (key: FieldKey, help?: boolean) =>
    [fieldErrors[key] ? `${key}-error` : null, help ? `${key}-help` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <form onSubmit={submit} noValidate className="space-y-5" data-testid="request-form" lang={lang}>
      {formError && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-brand-danger/40 bg-red-50 px-3 py-2 text-sm font-medium text-brand-danger"
        >
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">
            {t.name}
            <Req />
          </Label>
          <Input
            id="name"
            autoComplete="name"
            required
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={describe("name")}
          />
          <FieldError id="name" message={fieldErrors.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">
            {t.phone}
            <Req />
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={describe("phone")}
          />
          <FieldError id="phone" message={fieldErrors.phone} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t.email}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={describe("email")}
          />
          <FieldError id="email" message={fieldErrors.email} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="job_address">
            {t.address}
            <Req />
          </Label>
          <Input
            id="job_address"
            autoComplete="street-address"
            required
            value={values.job_address}
            onChange={(e) => set("job_address", e.target.value)}
            aria-invalid={Boolean(fieldErrors.job_address)}
            aria-describedby={describe("job_address")}
          />
          <FieldError id="job_address" message={fieldErrors.job_address} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="job_zip">
            {t.zip}
            <Req />
          </Label>
          <Input
            id="job_zip"
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={5}
            required
            value={values.job_zip}
            onChange={(e) => set("job_zip", e.target.value.replace(/\D/g, ""))}
            aria-invalid={Boolean(fieldErrors.job_zip)}
            aria-describedby={describe("job_zip")}
          />
          <FieldError id="job_zip" message={fieldErrors.job_zip} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="service_type">
            {t.service}
            <Req />
          </Label>
          <NativeSelect
            id="service_type"
            required
            value={values.service_type}
            onChange={(e) => set("service_type", e.target.value)}
            aria-invalid={Boolean(fieldErrors.service_type)}
            aria-describedby={describe("service_type")}
          >
            <option value="">{t.servicePlaceholder}</option>
            {serviceTypes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="service_type" message={fieldErrors.service_type} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">
            {t.description}
            <Req />
          </Label>
          <Textarea
            id="description"
            rows={4}
            required
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={describe("description", true)}
          />
          <p id="description-help" className="text-sm text-muted-foreground">
            {t.descriptionHelp}
          </p>
          <FieldError id="description" message={fieldErrors.description} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.photos}</legend>
        <p id="photos-help" className="text-sm text-muted-foreground">
          {t.photosHelp}
        </p>
        {photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="photo-previews">
            {photos.map((p, i) => (
              <li
                key={p.url}
                className="relative aspect-square overflow-hidden rounded-md border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 rounded-full bg-black/75 p-1 text-white"
                  aria-label={`${t.removePhoto}: ${p.file.name}`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_INTAKE_PHOTOS && (
          <Label
            htmlFor="photos"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-background px-3 py-4 text-sm font-semibold hover:bg-muted"
          >
            <ImagePlus className="size-4" aria-hidden /> {t.photos}
          </Label>
        )}
        <input
          ref={fileInput}
          id="photos"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          aria-describedby="photos-help"
          onChange={(e) => addPhotos(e.target.files)}
          data-testid="photo-input"
        />
        {photoError && (
          <p role="alert" className="text-sm font-medium text-brand-danger">
            {photoError}
          </p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="contact_time">{t.contactTime}</Label>
        <NativeSelect
          id="contact_time"
          value={values.preferred_contact_time}
          onChange={(e) => set("preferred_contact_time", e.target.value)}
        >
          {CONTACT_TIMES.map((c) => (
            <option key={c} value={c}>
              {t.times[c]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <fieldset className="rounded-md border bg-background p-3">
        <legend className="px-1 text-sm font-medium">{t.consentLabel}</legend>
        <div className="flex items-start gap-3">
          <Checkbox
            id="sms_consent"
            checked={consent}
            onCheckedChange={(on) => setConsent(on === true)}
            className="mt-0.5"
          />
          <Label htmlFor="sms_consent" className="text-sm leading-snug font-normal">
            {t.consent}
          </Label>
        </div>
      </fieldset>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">{t.honeypot}</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!hydrated || busy}
        data-testid="submit-request"
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {phase === "uploading" ? t.uploading : phase === "sending" ? t.sending : t.submit}
      </Button>
      <p className="text-center text-sm text-muted-foreground">{t.privacy}</p>
    </form>
  );
}
