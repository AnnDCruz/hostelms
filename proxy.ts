import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";
import { ROLE_HOME } from "@/lib/constants";

const { auth } = NextAuth(authConfig);

// Next.js 16 "proxy" (formerly middleware): sign-in gate + role-prefix routing.
export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  const isPublic = path === "/login" || path === "/set-password";

  if (!session?.user) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const home = ROLE_HOME[session.user.role];
  if (path === "/login" || path === "/") return NextResponse.redirect(new URL(home, nextUrl));

  const owner = Object.values(ROLE_HOME).find((p) => path === p || path.startsWith(`${p}/`));
  if (owner && owner !== home) return NextResponse.redirect(new URL(home, nextUrl));

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
