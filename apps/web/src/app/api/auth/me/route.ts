import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return fail("No autenticado", 401);
  return ok({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    handle: u.handle,
    role: u.platformRole,
    emailVerified: u.emailVerified,
    producerStatus: u.producerStatus,
    producerAccessUntil: u.producerAccessUntil,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    country: u.country,
    twoFactorEnabled: !!u.totpSecret,
  });
}

const Body = z.object({
  displayName: z.string().min(2).max(80).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().url().optional(),
  country: z.string().max(60).optional(),
});

// Editar el propio perfil
export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("No autenticado", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422);

  const patch: Record<string, unknown> = {};
  for (const k of ["displayName", "bio", "avatarUrl", "country"] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }
  if (Object.keys(patch).length === 0) return ok({ updated: false });

  const [updated] = await db.update(users).set(patch).where(eq(users.id, u.id)).returning();
  return ok({
    id: updated.id,
    displayName: updated.displayName,
    handle: updated.handle,
    avatarUrl: updated.avatarUrl,
    bio: updated.bio,
    country: updated.country,
  });
}
