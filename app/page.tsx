import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { ROLE_HOME } from "@/lib/constants";

export default async function Index() {
  const session = await auth();
  redirect(session?.user ? ROLE_HOME[session.user.role] : "/login");
}
