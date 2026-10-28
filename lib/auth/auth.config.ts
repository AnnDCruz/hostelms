import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

// Edge-safe half of the auth config: no Prisma, no bcrypt. Used by proxy.ts.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
        token.blockIds = user.blockIds;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      session.user.blockIds = token.blockIds as string[];
      return session;
    },
  },
} satisfies NextAuthConfig;
