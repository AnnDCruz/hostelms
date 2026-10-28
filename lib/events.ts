import type { NotificationCategory, Prisma, PrismaClient, Role } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export function audit(
  db: Db,
  input: {
    actorId: string;
    actorRole: Role;
    action: string;
    targetEntity: string;
    targetId: string;
    snapshot?: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({ data: input });
}

export function notify(
  db: Db,
  input: {
    recipientId: string;
    category: NotificationCategory;
    title: string;
    body: string;
    linkEntity?: string;
    linkId?: string;
  },
) {
  return db.notification.create({ data: input });
}

// One notification row per recipient (duplicates removed).
export function notifyMany(
  db: Db,
  recipientIds: string[],
  input: { category: NotificationCategory; title: string; body: string; linkEntity?: string; linkId?: string },
) {
  const ids = [...new Set(recipientIds)];
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return db.notification.createMany({ data: ids.map((recipientId) => ({ recipientId, ...input })) });
}
