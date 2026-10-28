import { z } from "zod";

export const createFeedbackSchema = z.object({
  body: z.string().trim().min(5, "Describe your feedback in a few words").max(1000),
});

export const feedbackActionSchema = z.object({
  action: z.enum(["acknowledge", "review", "resolve", "escalate"]),
  note: z.string().trim().max(500).optional(),
});
