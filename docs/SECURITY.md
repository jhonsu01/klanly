# Seguridad de Klanly

Registro de la auditoria de autorizacion y de las reglas que hay que respetar al
tocar la API. Informe con formato para leer/compartir: artefacto publicado en
claude.ai (privado del propietario del repo).

**Ultima auditoria:** commit `a8a94e8` — 60 rutas de API revisadas, 5 hallazgos,
5 corregidos.

---

## Reglas que no se pueden romper

Cualquier cambio en `apps/web/src/app/api/**` debe seguir cumpliendo esto:

1. **El contenido de una leccion es el producto.** `videoUrl`, `content` y
   `resources` solo se serializan si quien pregunta es **miembro activo o
   gestor**. Nunca se filtra "en el cliente": si el dato sale del servidor, ya
   se perdio. Los **titulos** si son publicos (indice = escaparate).
2. **Contenido interno de una comunidad** (feed, miembros, ranking, chat) pasa
   por `canReadCommunity()` de `lib/community.ts`: publico solo si la comunidad
   es **publica Y gratuita**; si cobra o es privada exige miembro activo, gestor
   o super admin.
3. **`currentUser()` es la unica puerta de sesion** y ya rechaza cuentas con
   `deletedAt`. No reimplementar la lectura del JWT por fuera.
4. **Escribir siempre exige membresia activa** (publicar, comentar, dar me
   gusta, chatear), no solo tener sesion.
5. **Acciones sensibles** (contrasena, 2FA, medios de pago, borrado de cuenta,
   cuentas de cobro) pasan por `verifyStepUp()`: PIN por correo o codigo 2FA.
6. **Subir archivos** exige correo verificado y esta limitado por usuario.
7. **Nada de HTML sin escapar.** El unico `dangerouslySetInnerHTML` permitido es
   el de `renderMarkdown()`, que escapa el HTML **antes** de generar etiquetas y
   solo acepta URLs `http(s)`.
8. **Listas blancas en los `zod`** de los PATCH de usuario: jamas aceptar
   `platformRole`, `producerStatus` ni nada que permita ascenderse solo.

---

## Como verificar la autorizacion

No basta con leer el codigo: hay que probar contra el servidor.

```bash
cd apps/web && npx next dev -p 3100
```

Se firman sesiones reales con el `JWT_SECRET` de `apps/web/.env` (`jose` +
`SignJWT`) y se llama a la API con la cookie `klanly_session`.

**Probar SIEMPRE las dos direcciones:**

- que nadie vea de mas (fuga),
- que el owner y el super admin **no vean de menos** (regresion que rompe el
  producto a quien si pago).

Para el caso "con sesion pero NO miembro" hay que crear un usuario temporal en
la base de datos —todos los usuarios reales son miembros de algo— y **borrarlo
al terminar**.

Matriz obtenida en la ultima auditoria, sobre una comunidad de pago:

| Quien pregunta          | feed | miembros | ranking | chat | contenido |
| ----------------------- | ---- | -------- | ------- | ---- | --------- |
| Sin sesion              | 401  | 401      | 401     | 401  | 0/7       |
| Con sesion, no miembro  | 403  | 403      | 403     | 403  | 0/7       |
| Productor (owner)       | 200  | 200      | 200     | 200  | 7/7       |
| Super admin             | 200  | 200      | 200     | 200  | 7/7       |

---

## Hallazgos corregidos en `a8a94e8`

| ID   | Severidad | Que pasaba | Correccion |
| ---- | --------- | ---------- | ---------- |
| H-01 | Critico   | `GET /api/courses/[id]` devolvia video, texto y material de todas las lecciones **sin sesion**: el muro de pago solo existia en la interfaz | Contenido solo para miembros activos y gestores, con doble candado membresia + nivel |
| H-02 | Alto      | `GET` de feed, miembros y ranking sin ninguna comprobacion | Helper `canReadCommunity()` |
| H-03 | Alto      | `currentUser()` no miraba `deletedAt`: el JWT de una cuenta borrada servia 7 dias | Se rechaza en cada peticion |
| H-04 | Medio     | `/api/upload` solo pedia sesion: cuentas desechables podian llenar el almacenamiento | Correo verificado + 20/min por usuario |
| H-05 | Medio     | Sin `Content-Security-Policy` | Anadida en `next.config.mjs`, verificada sin violaciones |

---

## Limites conocidos (no son fallos, son deuda)

1. **Rate limit en memoria.** `lib/ratelimit.ts` vive en la instancia serverless,
   que Vercel crea y destruye: frena a una persona insistiendo, no a un ataque
   distribuido. Migrar a Vercel KV o Upstash cuando haya trafico real.
2. **Cambiar la contrasena no cierra las demas sesiones.** Falta un
   `tokenVersion` en `users` que invalide los JWT anteriores. Recomendable antes
   de abrir la plataforma a mucha gente.
3. **La CSP permite `unsafe-inline`/`unsafe-eval`** en `script-src` porque lo
   exige el runtime de Next 14. Endurecerlo pide nonces por peticion desde un
   middleware.
4. **El APK se firma con la clave de depuracion.** Google Play exige una clave
   propia guardada fuera del repo, y **no se puede cambiar despues de publicar**.
5. **Los titulos de las lecciones son publicos** — decision de producto, no
   descuido. Revertirlo es una linea en `courses/[id]/route.ts`.
6. **Correo por Gmail SMTP sin dominio propio**: sin SPF/DKIM los avisos caen en
   spam. Ver el apartado de entregabilidad en el historial del proyecto.
