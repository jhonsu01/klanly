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
    avatarUrl: u.avatarUrl,
  });
}
