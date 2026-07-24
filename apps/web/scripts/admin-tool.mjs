// Utilidad de administración: lista usuarios o promueve uno a super admin.
//   node scripts/admin-tool.mjs               -> lista usuarios
//   node scripts/admin-tool.mjs <email>       -> promueve a admin (platform_role=admin, producer aprobado)
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error("No se encontró DATABASE_URL en apps/web/.env"); process.exit(1); }
const sql = neon(url);

const email = process.argv[2];
if (!email) {
  const rows = await sql`select email, handle, display_name, platform_role, producer_status from users order by created_at`;
  console.log(JSON.stringify(rows, null, 2));
} else {
  const res = await sql`update users set platform_role='admin', producer_status='approved' where email=${email} returning email, handle, platform_role`;
  if (res.length === 0) console.log("No existe un usuario con ese email:", email);
  else console.log("Promovido a SUPER ADMIN:", JSON.stringify(res[0]));
}
