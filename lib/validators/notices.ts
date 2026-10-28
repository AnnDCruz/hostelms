import { z } from "zod";

export const createNoticeSchema = z.object({
  title: z.string().trim().min(3, "Give the notice a title").max(120),
  body: z.string().trim().min(3, "Write the notice").max(2000),
  blockIds: z.array(z.string().min(1)).min(1, "Choose at least one block").max(30),
  expiresAt: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()), "Expiry must be a future date and time"),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(1000),
  parentId: z.string().min(1).nullish(),
});
