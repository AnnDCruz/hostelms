import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { LOCATION_ID } from "@/lib/constants";

const TTL_SECONDS = 60;

// Opt-out model: no FeatureFlag row means the feature is enabled.
export async function isFeatureEnabled(feature: string, role: Role, locationId = LOCATION_ID) {
  const key = `ff:${locationId}:${feature}:${role}`;

  if (redis) {
    try {
      const cached = await redis.get<boolean>(key);
      if (typeof cached === "boolean") return cached;
    } catch {
      // Redis unavailable: fall through to the database.
    }
  }

  const flag = await prisma.featureFlag.findUnique({
    where: { feature_role_locationId: { feature, role, locationId } },
    select: { enabled: true },
  });
  const enabled = flag?.enabled ?? true;

  if (redis) {
    try {
      await redis.set(key, enabled, { ex: TTL_SECONDS });
    } catch {
      // Ignore cache write failures.
    }
  }
  return enabled;
}
