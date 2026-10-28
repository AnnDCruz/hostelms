"use server";

import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/lib/auth/config";
import { endOpenShiftsForUser } from "@/lib/shifts";

export async function loginAction(_prev: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) return "Email or password is incorrect.";
    throw error; // lets Next.js perform the redirect on success
  }
}

export async function logoutAction() {
  // For a security guard, logging out is ending the shift.
  const session = await auth();
  if (session?.user?.role === "Security") await endOpenShiftsForUser(session.user.id);
  await signOut({ redirectTo: "/login" });
}
