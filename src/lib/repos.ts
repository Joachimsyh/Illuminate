import { execute, newId, query, queryOne } from "@/lib/db";
import {
  APPLICATION_SELECT,
  EVENT_DETAIL_SELECT,
  EVENT_SELECT,
  LUMA_CONNECTION_SELECT,
  USER_SELECT,
  type ApplicationRow,
  type EventDetailRow,
  type EventRow,
  type LumaConnectionRow,
  type UserRow,
} from "@/lib/db-types";

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT ${USER_SELECT} FROM users WHERE id = $1`,
    [id]
  );
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT ${USER_SELECT} FROM users WHERE email = $1`,
    [email]
  );
}

export async function findUserByLinkedinId(
  linkedinId: string
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT ${USER_SELECT} FROM users WHERE linkedin_id = $1`,
    [linkedinId]
  );
}

export async function createUser(data: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  passwordHash?: string | null;
  linkedinId?: string | null;
}): Promise<UserRow> {
  const id = newId();
  return (await queryOne<UserRow>(
    `INSERT INTO users (id, name, email, image, password_hash, linkedin_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_SELECT}`,
    [
      id,
      data.name ?? null,
      data.email ?? null,
      data.image ?? null,
      data.passwordHash ?? null,
      data.linkedinId ?? null,
    ]
  ))!;
}

export async function updateUser(
  id: string,
  data: Partial<{
    name: string | null;
    email: string | null;
    image: string | null;
    linkedinId: string | null;
    registrationName: string | null;
    registrationEmail: string | null;
    headline: string | null;
    company: string | null;
    location: string | null;
    bio: string | null;
    skills: string;
    techStack: string;
    interests: string;
    seniority: string | null;
    eventTypes: string;
    rawSource: string;
    writingSamples: string;
    onboardingCompleted: boolean;
    onboardingStep: number;
    agentEnabled: boolean;
    agentKeywords: string;
  }>
): Promise<UserRow> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  const add = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  if ("name" in data) add("name", data.name);
  if ("email" in data) add("email", data.email);
  if ("image" in data) add("image", data.image);
  if ("linkedinId" in data) add("linkedin_id", data.linkedinId);
  if ("registrationName" in data) add("registration_name", data.registrationName);
  if ("registrationEmail" in data)
    add("registration_email", data.registrationEmail);
  if ("headline" in data) add("headline", data.headline);
  if ("company" in data) add("company", data.company);
  if ("location" in data) add("location", data.location);
  if ("bio" in data) add("bio", data.bio);
  if ("skills" in data) add("skills", data.skills);
  if ("techStack" in data) add("tech_stack", data.techStack);
  if ("interests" in data) add("interests", data.interests);
  if ("seniority" in data) add("seniority", data.seniority);
  if ("eventTypes" in data) add("event_types", data.eventTypes);
  if ("rawSource" in data) add("raw_source", data.rawSource);
  if ("writingSamples" in data) add("writing_samples", data.writingSamples);
  if ("onboardingCompleted" in data)
    add("onboarding_completed", data.onboardingCompleted);
  if ("onboardingStep" in data) add("onboarding_step", data.onboardingStep);
  if ("agentEnabled" in data) add("agent_enabled", data.agentEnabled);
  if ("agentKeywords" in data) add("agent_keywords", data.agentKeywords);

  params.push(id);
  return (await queryOne<UserRow>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}
     RETURNING ${USER_SELECT}`,
    params
  ))!;
}

export async function listAgentUsers(): Promise<UserRow[]> {
  return query<UserRow>(
    `SELECT ${USER_SELECT} FROM users WHERE agent_enabled = TRUE`
  );
}

export async function findLumaConnection(
  userId: string
): Promise<LumaConnectionRow | null> {
  return queryOne<LumaConnectionRow>(
    `SELECT ${LUMA_CONNECTION_SELECT} FROM luma_connections WHERE user_id = $1`,
    [userId]
  );
}

export async function upsertLumaConnection(data: {
  userId: string;
  icsUrlEncrypted: string;
  icsUrlLastOkAt: Date;
  status: string;
  previewJson: string;
}): Promise<void> {
  await execute(
    `INSERT INTO luma_connections (
       id, user_id, ics_url_encrypted, ics_url_last_ok_at, status, preview_json
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       ics_url_encrypted = EXCLUDED.ics_url_encrypted,
       ics_url_last_ok_at = EXCLUDED.ics_url_last_ok_at,
       status = EXCLUDED.status,
       preview_json = EXCLUDED.preview_json,
       updated_at = NOW()`,
    [
      newId(),
      data.userId,
      data.icsUrlEncrypted,
      data.icsUrlLastOkAt,
      data.status,
      data.previewJson,
    ]
  );
}

export async function createLoginSession(data: {
  userId: string;
  provider: string;
  userAgent?: string | null;
  ip?: string | null;
  expiresAt: Date;
}): Promise<void> {
  await execute(
    `INSERT INTO login_sessions (id, user_id, provider, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      newId(),
      data.userId,
      data.provider,
      data.userAgent ?? null,
      data.ip ?? null,
      data.expiresAt,
    ]
  );
}

export async function createSessionRow(data: {
  sessionToken: string;
  userId: string;
  expires: Date;
}): Promise<void> {
  await execute(
    `INSERT INTO sessions (id, session_token, user_id, expires)
     VALUES ($1, $2, $3, $4)`,
    [newId(), data.sessionToken, data.userId, data.expires]
  );
}

export async function upsertOAuthToken(data: {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  provider: string;
}): Promise<void> {
  await execute(
    `INSERT INTO oauth_tokens (id, user_id, access_token, refresh_token, expires_at, provider)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       provider = EXCLUDED.provider,
       updated_at = NOW()`,
    [
      newId(),
      data.userId,
      data.accessToken,
      data.refreshToken,
      data.expiresAt,
      data.provider,
    ]
  );
}

export async function findApplication(
  userId: string,
  eventId: string
): Promise<ApplicationRow | null> {
  return queryOne<ApplicationRow>(
    `SELECT ${APPLICATION_SELECT} FROM applications
     WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
}

export async function listApplications(userId: string): Promise<ApplicationRow[]> {
  return query<ApplicationRow>(
    `SELECT ${APPLICATION_SELECT} FROM applications
     WHERE user_id = $1
     ORDER BY applied_at DESC`,
    [userId]
  );
}

export async function upsertApplication(data: {
  userId: string;
  eventId: string;
  eventTitle: string;
  eventUrl: string;
  eventDate: string | null;
  status: string;
  message: string | null;
  formPayload: string | null;
  responseBody: string | null;
}): Promise<ApplicationRow> {
  return (await queryOne<ApplicationRow>(
    `INSERT INTO applications (
       id, user_id, event_id, event_title, event_url, event_date,
       status, message, form_payload, response_body
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id, event_id) DO UPDATE SET
       event_title = EXCLUDED.event_title,
       event_url = EXCLUDED.event_url,
       event_date = EXCLUDED.event_date,
       status = EXCLUDED.status,
       message = EXCLUDED.message,
       form_payload = EXCLUDED.form_payload,
       response_body = EXCLUDED.response_body,
       applied_at = NOW()
     RETURNING ${APPLICATION_SELECT}`,
    [
      newId(),
      data.userId,
      data.eventId,
      data.eventTitle,
      data.eventUrl,
      data.eventDate,
      data.status,
      data.message,
      data.formPayload,
      data.responseBody,
    ]
  ))!;
}

export async function findEventBySlug(slug: string): Promise<EventRow | null> {
  return queryOne<EventRow>(
    `SELECT ${EVENT_SELECT} FROM events WHERE slug = $1`,
    [slug]
  );
}

export async function createEvent(data: {
  slug: string;
  lumaApiId: string | null;
  title: string;
  description: string;
  lumaUrl: string;
  coverUrl: string | null;
  location: string | null;
  isOnline: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  guestCount: number;
  isPaid: boolean;
  requiresApproval: boolean;
  sourceFeeds: string;
}): Promise<void> {
  await execute(
    `INSERT INTO events (
       id, slug, luma_api_id, title, description, luma_url, cover_url,
       location, is_online, starts_at, ends_at, guest_count,
       is_paid, requires_approval, source_feeds
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (slug) DO NOTHING`,
    [
      newId(),
      data.slug,
      data.lumaApiId,
      data.title,
      data.description,
      data.lumaUrl,
      data.coverUrl,
      data.location,
      data.isOnline,
      data.startsAt,
      data.endsAt,
      data.guestCount,
      data.isPaid,
      data.requiresApproval,
      data.sourceFeeds,
    ]
  );
}

export async function listUpcomingEvents(limit = 400): Promise<EventRow[]> {
  return query<EventRow>(
    `SELECT ${EVENT_SELECT} FROM events
     WHERE starts_at IS NULL OR starts_at >= NOW() - INTERVAL '1 hour'
     ORDER BY starts_at ASC NULLS LAST
     LIMIT $1`,
    [limit]
  );
}

export async function findEventDetailBySlug(
  slug: string
): Promise<EventDetailRow | null> {
  return queryOne<EventDetailRow>(
    `SELECT ${EVENT_DETAIL_SELECT} FROM event_details WHERE slug = $1`,
    [slug]
  );
}

export async function listEventSlugsMissingDetails(
  limit = 50
): Promise<string[]> {
  const rows = await query<{ slug: string }>(
    `SELECT e.slug
     FROM events e
     LEFT JOIN event_details d ON d.slug = e.slug
     WHERE d.slug IS NULL
     ORDER BY e.discovered_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.slug);
}

export async function upsertEventDetail(data: {
  slug: string;
  lumaApiId: string | null;
  title: string;
  descriptionText: string;
  descriptionMirrorJson: string;
  coverUrl: string | null;
  socialImageUrl: string | null;
  location: string | null;
  locationJson: string;
  isOnline: boolean;
  timezone: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  guestCount: number;
  ticketCount: number;
  isFree: boolean;
  isSoldOut: boolean;
  requiresApproval: boolean;
  registrationAvailability: string | null;
  waitlistEnabled: boolean;
  hostsJson: string;
  ticketTypesJson: string;
  ticketInfoJson: string;
  registrationQuestionsJson: string;
  categoriesJson: string;
  featuredGuestsJson: string;
  calendarJson: string;
  faqsJson: string | null;
  payloadJson: string;
}): Promise<void> {
  await execute(
    `INSERT INTO event_details (
       id, slug, luma_api_id, title, description_text, description_mirror_json,
       cover_url, social_image_url, location, location_json, is_online, timezone,
       starts_at, ends_at, guest_count, ticket_count, is_free, is_sold_out,
       requires_approval, registration_availability, waitlist_enabled,
       hosts_json, ticket_types_json, ticket_info_json, registration_questions_json,
       categories_json, featured_guests_json, calendar_json, faqs_json, payload_json
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,$27,$28,$29,$30
     )
     ON CONFLICT (slug) DO UPDATE SET
       luma_api_id = EXCLUDED.luma_api_id,
       title = EXCLUDED.title,
       description_text = EXCLUDED.description_text,
       description_mirror_json = EXCLUDED.description_mirror_json,
       cover_url = EXCLUDED.cover_url,
       social_image_url = EXCLUDED.social_image_url,
       location = EXCLUDED.location,
       location_json = EXCLUDED.location_json,
       is_online = EXCLUDED.is_online,
       timezone = EXCLUDED.timezone,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       guest_count = EXCLUDED.guest_count,
       ticket_count = EXCLUDED.ticket_count,
       is_free = EXCLUDED.is_free,
       is_sold_out = EXCLUDED.is_sold_out,
       requires_approval = EXCLUDED.requires_approval,
       registration_availability = EXCLUDED.registration_availability,
       waitlist_enabled = EXCLUDED.waitlist_enabled,
       hosts_json = EXCLUDED.hosts_json,
       ticket_types_json = EXCLUDED.ticket_types_json,
       ticket_info_json = EXCLUDED.ticket_info_json,
       registration_questions_json = EXCLUDED.registration_questions_json,
       categories_json = EXCLUDED.categories_json,
       featured_guests_json = EXCLUDED.featured_guests_json,
       calendar_json = EXCLUDED.calendar_json,
       faqs_json = EXCLUDED.faqs_json,
       payload_json = EXCLUDED.payload_json,
       updated_at = NOW()`,
    [
      newId(),
      data.slug,
      data.lumaApiId,
      data.title,
      data.descriptionText,
      data.descriptionMirrorJson,
      data.coverUrl,
      data.socialImageUrl,
      data.location,
      data.locationJson,
      data.isOnline,
      data.timezone,
      data.startsAt,
      data.endsAt,
      data.guestCount,
      data.ticketCount,
      data.isFree,
      data.isSoldOut,
      data.requiresApproval,
      data.registrationAvailability,
      data.waitlistEnabled,
      data.hostsJson,
      data.ticketTypesJson,
      data.ticketInfoJson,
      data.registrationQuestionsJson,
      data.categoriesJson,
      data.featuredGuestsJson,
      data.calendarJson,
      data.faqsJson,
      data.payloadJson,
    ]
  );
}
