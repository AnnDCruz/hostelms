import { z } from "zod";

export const createMaintenanceSchema = z.object({
  description: z.string().trim().min(5, "Describe the problem in a few words").max(500),
});

export const maintenanceActionSchema = z.object({
  action: z.enum(["start", "resolve", "reopen"]),
});
