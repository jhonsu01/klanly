import { db } from "@/db";
import { paymentOrders, communities, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { getMembership, canManage } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Datos de la factura de una orden (el comprador o el productor de la comunidad)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return fail("No autenticado", 401);

  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, params.id)).limit(1);
  if (!order) return fail("Orden no encontrada", 404);

  const isOwnerOfOrder = order.userId === me.id;
  let authorized = isOwnerOfOrder || me.platformRole === "admin";
  if (!authorized) {
    const m = await getMembership(order.communityId, me.id);
    authorized = canManage(me.platformRole, m?.role);
  }
  if (!authorized) return fail("No autorizado", 403);

  const [c] = await db.select().from(communities).where(eq(communities.id, order.communityId)).limit(1);
  const [buyer] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);

  return ok({
    invoiceNumber: order.reference.toUpperCase(),
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    method: order.method,
    amountCents: order.amountCents,
    currency: order.currency,
    community: c ? { name: c.name, slug: c.slug } : null,
    buyer: buyer ? { name: buyer.displayName, email: buyer.email, country: buyer.country } : null,
    lineItem: c ? `Membresía ${c.name}` : "Membresía",
  });
}
