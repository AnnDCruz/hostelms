import { z } from "zod";

export const createGatepassSchema = z
  .object({
    departureTime: z.coerce.date(),
    expectedReturnTime: z.coerce.date(),
    reason: z.string().trim().min(3, "Give a short reason").max(500),
  })
  .refine((v) => v.expectedReturnTime > v.departureTime, {
    message: "Return time must be after departure",
    path: ["expectedReturnTime"],
  })
  .refine((v) => v.expectedReturnTime > new Date(), {
    message: "Return time must be in the future",
    path: ["expectedReturnTime"],
  });

export const gatepassActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});
