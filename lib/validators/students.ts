import { z } from "zod";

// Empty string clears a field (null), undefined leaves it unchanged.
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

const looseEmail = z
  .string()
  .trim()
  .max(120)
  .refine((v) => v === "" || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email")
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .nullish();

const email = z
  .string()
  .trim()
  .pipe(z.email("Enter a valid email"))
  .transform((v) => v.toLowerCase());

const year = z.coerce.number().int().min(1).max(8).nullish();
const gender = z.enum(["Male", "Female", "Other"]);

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, "Enter the student's name").max(100),
  rollNumber: z.string().trim().min(3, "Enter a roll number").max(30),
  email,
  gender,
  course: text(100),
  year,
  phone: text(20),
  whatsappNumber: text(20),
  parent: z.object({
    name: z.string().trim().min(2, "Enter the parent's name").max(100),
    email,
    phone: text(20),
  }),
  secondaryContact: z.object({ name: text(100), phone: text(20), email: looseEmail }).nullish(),
});

export const updateStudentSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  gender: gender.optional(),
  course: text(100),
  year,
  phone: text(20),
  whatsappNumber: text(20),
  parent: z.object({ name: z.string().trim().min(2).max(100).optional(), phone: text(20) }).optional(),
  secondaryContact: z.object({ name: text(100), phone: text(20), email: looseEmail }).optional(),
});

// Students may only change their own phone numbers.
export const updateOwnProfileSchema = z.object({
  phone: text(20),
  whatsappNumber: text(20),
});

export const inviteSchema = z.object({ target: z.enum(["student", "parent", "both"]) });

export const setPasswordSchema = z.object({
  token: z.string().min(20),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72, "Use at most 72 characters")
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/\d/, "Include at least one number"),
});
