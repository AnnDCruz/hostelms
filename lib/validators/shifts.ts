import { z } from "zod";

export const startShiftSchema = z.object({ blockId: z.string("Choose a block").min(1, "Choose a block") });

export const resolveShiftSchema = z.object({
  shiftOut: z
    .string("Enter the time the shift ended")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date and time"),
});
