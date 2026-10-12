import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";

const SESSION_COOKIE = "morrow_session";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

export function getBrowserOwnerId(req: Request, res: Response): string {
  const current = req.cookies?.[SESSION_COOKIE];
  if (typeof current === "string" && UUID_PATTERN.test(current)) {
    return current;
  }

  const ownerId = randomUUID();
  res.cookie(SESSION_COOKIE, ownerId, {
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return ownerId;
}

export function reportSupabaseError(
  req: Request,
  operation: string,
  error: { code?: unknown; status?: unknown },
): void {
  req.log.error(
    {
      operation,
      providerCode: typeof error.code === "string" ? error.code : undefined,
      providerStatus:
        typeof error.status === "number" ? error.status : undefined,
    },
    "Supabase request failed",
  );
}

export const CHAT_STORAGE_ERROR =
  "Chat storage isn't ready. Run the Supabase setup script, then try again.";
