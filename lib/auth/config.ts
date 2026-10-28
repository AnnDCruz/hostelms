import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// The blocks a user is scoped to, stored on the JWT so every request can filter cheaply.
async function resolveBlockIds(userId: string, role: Role): Promise<string[]> {
  switch (role) {
    case "Warden": {
      const rows = await prisma.blockWarden.findMany({
        where: { removedAt: null, warden: { userId } },
        select: { blockId: true },
      });
      return rows.map((r) => r.blockId);
    }
    case "Security": {
      const rows = await prisma.blockSecurity.findMany({
        where: { removedAt: null, guard: { userId } },
        select: { blockId: true },
      });
      return rows.map((r) => r.blockId);
    }
    case "Student": {
      const s = await prisma.student.findUnique({
        where: { userId },
        select: { room: { select: { blockId: true } } },
      });
      return s?.room ? [s.room.blockId] : [];
    }
    case "Parent": {
      const p = await prisma.parent.findUnique({
        where: { userId },
        select: { student: { select: { room: { select: { blockId: true } } } } },
      });
      return p?.student.room ? [p.student.room.blockId] : [];
    }
    default:
      return [];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.isActive || user.deletedAt) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          blockIds: await resolveBlockIds(user.id, user.role),
        };
      },
    }),
  ],
});
