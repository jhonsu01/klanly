import { z } from "zod";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { resolveCommunity, getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calendario: próximos eventos
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const rows = await db
    .select()
    .from(events)
    .where(eq(events.communityId, c.id))
    .orderBy(asc(events.startsAt))
    .limit(100);
  return ok(rows);
}

const Body = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  linkUrl: z.string().url().optional(),
  kind: z.enum(["meet", "link"]).default("meet"),
});

// Crear evento (owner/admin)
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const c = await resolveCommunity(params.slug);
  if (!c) return fail("Comunidad no encontrada", 404);

  const m = await getMembership(c.id, me.id);
  if (!canManage(me.platformRole, m?.role)) return fail("Solo el productor puede crear eventos", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos", 422, { issues: parsed.error.issues });

  const [ev] = await db
    .insert(events)
    .values({
      communityId: c.id,
      title: parsed.data.title,
      description: parsed.data.description,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      linkUrl: parsed.data.linkUrl,
      kind: parsed.data.kind,
    })
    .returning();

  return ok(ev, 201);
}
