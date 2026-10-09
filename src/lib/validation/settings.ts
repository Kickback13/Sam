import { z } from "zod";

import { brandSchema } from "@/lib/brand";

import { optionalText, requiredText } from "./common";

export const MEMBER_ROLES = ["owner", "admin", "agent", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const workspaceProfileSchema = z.object({
  workspaceId: z.uuid(),
  name: requiredText(120, "Workspace name is required"),
  legal_name: optionalText(200),
  license: optionalText(60),
  phone: optionalText(40),
  address: optionalText(300),
  owner_email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.email("Enter a valid email").nullable(),
  ),
});

export const workspaceBrandSchema = z.object({
  workspaceId: z.uuid(),
  brand: brandSchema,
});

export const inviteInputSchema = z.object({
  workspaceId: z.uuid(),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.email("Enter a valid email").nullable(),
  ),
  role: z.enum(MEMBER_ROLES),
});

export const memberRoleSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(MEMBER_ROLES),
});

export const stageInputSchema = z.object({
  workspaceId: z.uuid(),
  pipelineId: z.uuid(),
  name: requiredText(60, "Stage name is required"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color")
    .default("#64748B"),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  is_won: z.boolean().default(false),
  is_lost: z.boolean().default(false),
});

export const stageUpdateSchema = stageInputSchema.extend({ stageId: z.uuid() });
