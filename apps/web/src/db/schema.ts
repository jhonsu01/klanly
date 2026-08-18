import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  bigserial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ===================== IDENTIDAD =====================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle").notNull().unique(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  country: text("country"),
  emailVerified: boolean("email_verified").notNull().default(false),
  // user | producer | admin
  platformRole: text("platform_role").notNull().default("user"),
  // Estado de aprobación como productor (paga a la plataforma para publicar)
  producerStatus: text("producer_status").notNull().default("none"), // none|pending|approved|rejected
  producerAccessUntil: timestamp("producer_access_until", { withTimezone: true }), // vigencia del plan
  producerPlanMonths: integer("producer_plan_months"), // plan solicitado (meses)
  producerProofUrl: text("producer_proof_url"), // comprobante de pago del plan
  /**
   * Cuantas comunidades puede tener publicadas. Cada pago aprobado por el
   * admin da derecho a UNA. Antes un solo pago abria comunidades ilimitadas
   * mientras durara la vigencia: el cobro no se correspondia con lo entregado.
   */
  communityQuota: integer("community_quota").notNull().default(0),
  totpSecret: text("totp_secret"),
  /** Cuenta eliminada por el usuario: se anonimiza, no se borra la fila
   *  (los registros contables de pagos deben conservarse). */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== COMUNIDADES (tenants) =====================
export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    iconUrl: text("icon_url"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    isPublic: boolean("is_public").notNull().default(true),
    priceCents: integer("price_cents").notNull().default(0), // 0 = Free
    currency: text("currency").notNull().default("USD"),
    // month | year | one_time | free
    billingPeriod: text("billing_period").notNull().default("free"),
    theme: jsonb("theme").default({}),
    // F4 afiliados
    affiliateEnabled: boolean("affiliate_enabled").notNull().default(false),
    affiliateCommissionPct: numeric("affiliate_commission_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    payoutTermsDays: integer("payout_terms_days").notNull().default(30), // 30 | 60
    // Transferencia manual: cuentas que ve el miembro al pagar (banco/número/titular)
    manualEnabled: boolean("manual_enabled").notNull().default(true),
    manualAccounts: jsonb("manual_accounts").$type<{ bank: string; number: string; name: string }[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("communities_owner_idx").on(t.ownerId),
  }),
);

// Roles y estado del miembro DENTRO de una comunidad
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"), // owner|admin|moderator|member
    status: text("status").notNull().default("active"), // active|past_due|canceled|pending
    level: integer("level").notNull().default(1),
    points: integer("points").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqMember: uniqueIndex("memberships_community_user_uniq").on(t.communityId, t.userId),
  }),
);

// ===================== PAGOS (reciclado de rifas) =====================
export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    membershipId: uuid("membership_id").references(() => memberships.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    method: text("method").notNull(), // wompi | manual
    kind: text("kind").notNull(), // subscription_initial | renewal | one_time
    // pending | awaiting_review | paid | failed | expired | refunded
    status: text("status").notNull().default("pending"),
    reference: text("reference").notNull().unique(), // referencia firmada
    integrityHash: text("integrity_hash").notNull(), // HMAC(reference|amount|currency|secret)
    manualProofUrl: text("manual_proof_url"),
    referralCode: text("referral_code"), // F4: link de afiliado usado
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("payment_orders_status_idx").on(t.status, t.expiresAt),
    refIdx: index("payment_orders_reference_idx").on(t.reference),
  }),
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("active"), // active|past_due|canceled
  provider: text("provider").notNull(), // wompi | manual
  paymentSourceId: text("payment_source_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtEnd: boolean("cancel_at_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Idempotencia de webhooks (identico a processed_events de rifas)
export const processedEvents = pgTable("processed_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== AFILIADOS Y PAYOUTS =====================
export const affiliateReferrals = pgTable("affiliate_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id")
    .notNull()
    .references(() => users.id),
  referredId: uuid("referred_id")
    .notNull()
    .references(() => users.id),
  communityId: uuid("community_id").references(() => communities.id),
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("40.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  payeeId: uuid("payee_id")
    .notNull()
    .references(() => users.id),
  communityId: uuid("community_id").references(() => communities.id), // comunidad que autoriza (afiliados)
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  kind: text("kind").notNull(), // community_earnings | affiliate
  method: text("method"), // medio de pago (texto)
  status: text("status").notNull().default("requested"), // requested|approved|paid|rejected
  approvedBy: uuid("approved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== F4: AFILIADOS =====================
// Autorización de un usuario como afiliado de una comunidad (el productor aprueba)
export const communityAffiliates = pgTable(
  "community_affiliates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    code: text("code").notNull().unique(), // código del link de referido
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("community_affiliates_com_user_uniq").on(t.communityId, t.userId),
    codeIdx: index("community_affiliates_code_idx").on(t.code),
  }),
);

// Comisiones acumuladas por afiliado (saldo). pending -> available (net30/60) -> paid
export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateUserId: uuid("affiliate_user_id")
      .notNull()
      .references(() => users.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    orderId: uuid("order_id").references(() => paymentOrders.id),
    referredUserId: uuid("referred_user_id").references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"), // pending | available | paid
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    payoutId: uuid("payout_id").references(() => payouts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    affIdx: index("commissions_affiliate_idx").on(t.affiliateUserId, t.status),
  }),
);

// Medio de pago del usuario para recibir comisiones (manual: texto)
export const payoutMethods = pgTable("payout_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  type: text("type").notNull(), // nequi | bancolombia | paypal | bank | otro
  accountName: text("account_name"), // nombre del titular (opcional)
  details: text("details").notNull(), // número de cuenta / llave / correo
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== CONTENIDO =====================
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title"),
    body: text("body"),
    category: text("category"),
    pinned: boolean("pinned").default(false),
    likeCount: integer("like_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    feedIdx: index("posts_community_created_idx").on(t.communityId, t.createdAt),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index("comments_post_idx").on(t.postId),
  }),
);

// ===================== CLASSROOM =====================
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    title: text("title").notNull(),
    coverUrl: text("cover_url"),
    description: text("description"),
    minLevel: integer("min_level").notNull().default(1), // bloqueo por nivel
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    comIdx: index("courses_community_idx").on(t.communityId),
  }),
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    moduleName: text("module_name"),
    title: text("title").notNull(),
    videoUrl: text("video_url"),
    content: text("content"),
    /** Material complementario: enlaces externos e imágenes alojadas fuera. */
    resources: jsonb("resources").$type<{ kind: "link" | "image"; label: string; url: string }[]>(),
    /** "video" = lección normal · "workout" = entrenamiento por repeticiones. */
    kind: text("kind").notNull().default("video"),
    /**
     * Parámetros del modo entrenamiento. El entrenador declara cuántas
     * repeticiones trae el video; el alumno pide las que quiere y el
     * reproductor repite el video las pasadas necesarias.
     */
    workout: jsonb("workout").$type<{
      repsPerRound: number;   // repeticiones que contiene el video
      defaultReps: number;    // objetivo sugerido por el entrenador
      restSeconds: number;    // descanso entre pasadas
      muted: boolean;         // silenciar (música propia del alumno)
    }>(),
    minLevel: integer("min_level").notNull().default(1),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    courseIdx: index("lessons_course_idx").on(t.courseId),
  }),
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    pk: uniqueIndex("lesson_progress_pk").on(t.userId, t.lessonId),
  }),
);

// ===================== F3: LEADERBOARDS / EVENTOS / NOTIS / CHAT =====================

// Ledger de puntos: permite calcular leaderboards por ventana (7d/30d/all-time)
export const pointEvents = pgTable(
  "point_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(),
    reason: text("reason"), // like | lesson_complete | ...
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lbIdx: index("point_events_community_created_idx").on(t.communityId, t.createdAt),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    linkUrl: text("link_url"),
    kind: text("kind").notNull().default("meet"), // meet | link
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    calIdx: index("events_community_start_idx").on(t.communityId, t.startsAt),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    communityId: uuid("community_id").references(() => communities.id),
    type: text("type").notNull(), // payment_approved | level_up | new_post | ...
    body: text("body").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId, t.read),
  }),
);

// Chat de comunidad (MVP por sondeo/polling; realtime se añade con proveedor externo)
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    chatIdx: index("messages_community_created_idx").on(t.communityId, t.createdAt),
  }),
);

// Códigos de un solo uso: verificación de email y confirmación de acciones sensibles
export const authCodes = pgTable(
  "auth_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    purpose: text("purpose").notNull(), // verify_email | step_up
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ idx: index("auth_codes_user_purpose_idx").on(t.userId, t.purpose) }),
);

// ===================== AJUSTES DE PLATAFORMA (singleton) =====================
// Cuentas donde los productores pagan a la plataforma + planes de acceso.
export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("default"),
  adminAccounts: jsonb("admin_accounts").$type<{ bank: string; number: string; name: string }[]>().notNull().default([]),
  producerPlans: jsonb("producer_plans").$type<{ label: string; months: number; priceCents: number; currency: string }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===================== AUDITORIA =====================
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Community = typeof communities.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;

// ===================== PANTALLAS EMPAREJADAS (Android TV) =====================
/**
 * Un televisor que muestra los entrenamientos. La TV no tiene sesión: pide un
 * PIN, el alumno lo escribe en el celular y desde ese momento el celular le
 * envía qué reproducir. El canal de tiempo real usa el `id` (no adivinable),
 * nunca el PIN de 6 dígitos.
 */
export const castDevices = pgTable(
  "cast_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pin: text("pin").notNull(),
    /**
     * Secreto que guarda la propia TV. Le permite recuperar SU identidad al
     * recargarse (atrás en el mando, reinicio del televisor) en vez de pedir
     * un PIN nuevo y romper el emparejamiento del celular.
     */
    deviceSecret: text("device_secret"),
    /** Usuario que emparejó la pantalla (null mientras espera). */
    userId: uuid("user_id").references(() => users.id),
    label: text("label"), // nombre que muestra la TV, p. ej. "Sala"
    /** El PIN deja de servir pasado este momento. */
    pinExpiresAt: timestamp("pin_expires_at", { withTimezone: true }).notNull(),
    /** El emparejamiento caduca (hay que volver a emparejar). */
    pairedUntil: timestamp("paired_until", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pinIdx: index("cast_devices_pin_idx").on(t.pin, t.pinExpiresAt),
    userIdx: index("cast_devices_user_idx").on(t.userId),
  }),
);
