import { z } from "zod";

export const createRoomSchema = z.object({
  blockId: z.string().min(1),
  roomNumber: z.string().trim().min(1, "Enter a room number").max(10),
  floor: z.coerce.number().int().min(0).max(30),
});

export const roomActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("allocate"), studentId: z.string().min(1) }),
  z.object({ type: z.literal("vacate") }),
  z.object({ type: z.literal("transfer"), targetRoomId: z.string().min(1) }),
  z.object({ type: z.literal("block"), reason: z.string().trim().min(3, "Give a short reason").max(300) }),
  z.object({ type: z.literal("unblock"), note: z.string().trim().max(300).optional() }),
  z.object({
    type: z.literal("assignStaff"),
    name: z.string().trim().min(2, "Enter the staff member's name").max(100),
    designation: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(20).optional(),
  }),
  z.object({ type: z.literal("removeStaff") }),
]);
