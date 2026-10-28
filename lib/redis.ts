import { Redis } from "@upstash/redis";

// Redis is optional. Without credentials we export null and callers degrade to DB-only.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
