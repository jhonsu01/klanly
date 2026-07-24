# Klanly — Web + API (Next.js)

App web y backend de Klanly. Se despliega en **Vercel** (root directory = `apps/web`) y usa **Neon** (Postgres serverless).

## Endpoints (Fase F0/F1)

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/auth/register` | Crear cuenta (devuelve sesión) |
| POST | `/api/auth/login` | Iniciar sesión (JWT en cookie) |
| GET | `/api/auth/me` | Usuario actual |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/communities` | Listar comunidades públicas |
| POST | `/api/communities` | Crear comunidad (te vuelve *productor*) |
| GET | `/api/communities/[slug]` | Detalle de comunidad |
| POST | `/api/communities/[id]/join` | Unirse (free inmediato / pago → orden) |
| POST | `/api/payments/orders` | Crear orden con pasarela (Wompi) |
| POST | `/api/payments/orders/manual` | Crear orden manual + comprobante |
| POST | `/api/payments/orders/[id]/review` | Aprobar/rechazar cobro manual (admin/productor) |
| POST | `/api/webhooks/wompi` | Webhook de Wompi (firma + idempotencia) |
| GET | `/api/admin/payments/pending` | Cola de comprobantes por revisar |

## Setup local

```bash
cd apps/web
npm install
cp .env.example .env            # rellena DATABASE_URL, JWT_SECRET, etc.
npm run db:push                 # crea las tablas en Neon
npm run dev                     # http://localhost:3000
```

## Variables de entorno

Ver [`.env.example`](.env.example). Mínimas para arrancar F0: `DATABASE_URL`, `JWT_SECRET`, `PAYMENTS_HMAC_SECRET`.
Para F1 (pasarela): `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`.

## Base de datos

Esquema en `src/db/schema.ts` (Drizzle). Aplica con `npm run db:push` o genera SQL con `npm run db:generate`.
