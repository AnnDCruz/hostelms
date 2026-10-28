import { z } from "zod";

export const MIN_DURATION = 1;
export const MAX_DURATION = 60;
export const MAX_MACHINES_PER_TYPE = 20;

const durationMessage = `Choose between ${MIN_DURATION} and ${MAX_DURATION} minutes`;

export const durationSchema = z.object({
  durationMinutes: z.number(durationMessage).int(durationMessage).min(MIN_DURATION, durationMessage).max(MAX_DURATION, durationMessage),
});

export const maintenanceSchema = z.object({ maintenance: z.boolean("maintenance must be true or false") });

const countMessage = `Enter a whole number from 0 to ${MAX_MACHINES_PER_TYPE}`;
const count = z.number(countMessage).int(countMessage).min(0, countMessage).max(MAX_MACHINES_PER_TYPE, countMessage);

export const configSchema = z.object({ washers: count, dryers: count });
