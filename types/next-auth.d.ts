import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    blockIds: string[];
  }
  interface Session {
    user: { id: string; role: Role; blockIds: string[] } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    blockIds: string[];
  }
}
