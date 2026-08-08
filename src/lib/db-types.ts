export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  passwordHash: string | null;
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
  premiumUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LumaConnectionRow = {
  id: string;
  userId: string;
  icsUrlEncrypted: string;
  icsUrlLastOkAt: Date | null;
  status: string;
  previewJson: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ApplicationRow = {
  id: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  eventUrl: string;
  eventDate: string | null;
  status: string;
  message: string | null;
  formPayload: string | null;
  responseBody: string | null;
  appliedAt: Date;
  notifiedAt: Date | null;
};

export type EventRow = {
  id: string;
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
  discoveredAt: Date;
  updatedAt: Date;
};

export type EventDetailRow = {
  id: string;
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
  scrapedAt: Date;
  updatedAt: Date;
};

export type UserProfileRow = {
  id: string;
  userId: string;
  headline: string | null;
  bio: string | null;
  company: string | null;
  seniority: string | null;
  skillsJson: string;
  techStackJson: string;
  interestsJson: string;
  locationsJson: string;
  eventTypesJson: string;
  keywordsJson: string;
  rawSource: string;
  sourceHash: string;
  selectionsHash: string;
  linkedinSnapshotJson: string;
  agent1Provider: string | null;
  extractedAt: Date | null;
  postsSyncedAt: Date | null;
  age: number | null;
  lifeStatus: string | null;
  placeOfWorkStudy: string | null;
  agentSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProfilePostRow = {
  id: string;
  userId: string;
  content: string;
  contentHash: string;
  source: string;
  postedAt: Date | null;
  topicsJson: string;
  createdAt: Date;
};

export type KnowledgeNodeRow = {
  id: string;
  userId: string;
  kind: string;
  key: string;
  label: string;
  propsJson: string;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeEdgeRow = {
  id: string;
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  weight: number;
  propsJson: string;
  createdAt: Date;
};

export const USER_SELECT = `
  id,
  name,
  email,
  email_verified AS "emailVerified",
  image,
  password_hash AS "passwordHash",
  linkedin_id AS "linkedinId",
  registration_name AS "registrationName",
  registration_email AS "registrationEmail",
  headline,
  company,
  location,
  bio,
  skills,
  tech_stack AS "techStack",
  interests,
  seniority,
  event_types AS "eventTypes",
  raw_source AS "rawSource",
  writing_samples AS "writingSamples",
  onboarding_completed AS "onboardingCompleted",
  onboarding_step AS "onboardingStep",
  agent_enabled AS "agentEnabled",
  agent_keywords AS "agentKeywords",
  premium_until AS "premiumUntil",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const EVENT_SELECT = `
  id,
  slug,
  luma_api_id AS "lumaApiId",
  title,
  description,
  luma_url AS "lumaUrl",
  cover_url AS "coverUrl",
  location,
  is_online AS "isOnline",
  starts_at AS "startsAt",
  ends_at AS "endsAt",
  guest_count AS "guestCount",
  is_paid AS "isPaid",
  requires_approval AS "requiresApproval",
  source_feeds AS "sourceFeeds",
  discovered_at AS "discoveredAt",
  updated_at AS "updatedAt"
`;

export const EVENT_DETAIL_SELECT = `
  id,
  slug,
  luma_api_id AS "lumaApiId",
  title,
  description_text AS "descriptionText",
  description_mirror_json AS "descriptionMirrorJson",
  cover_url AS "coverUrl",
  social_image_url AS "socialImageUrl",
  location,
  location_json AS "locationJson",
  is_online AS "isOnline",
  timezone,
  starts_at AS "startsAt",
  ends_at AS "endsAt",
  guest_count AS "guestCount",
  ticket_count AS "ticketCount",
  is_free AS "isFree",
  is_sold_out AS "isSoldOut",
  requires_approval AS "requiresApproval",
  registration_availability AS "registrationAvailability",
  waitlist_enabled AS "waitlistEnabled",
  hosts_json AS "hostsJson",
  ticket_types_json AS "ticketTypesJson",
  ticket_info_json AS "ticketInfoJson",
  registration_questions_json AS "registrationQuestionsJson",
  categories_json AS "categoriesJson",
  featured_guests_json AS "featuredGuestsJson",
  calendar_json AS "calendarJson",
  faqs_json AS "faqsJson",
  payload_json AS "payloadJson",
  scraped_at AS "scrapedAt",
  updated_at AS "updatedAt"
`;

export const APPLICATION_SELECT = `
  id,
  user_id AS "userId",
  event_id AS "eventId",
  event_title AS "eventTitle",
  event_url AS "eventUrl",
  event_date AS "eventDate",
  status,
  message,
  form_payload AS "formPayload",
  response_body AS "responseBody",
  applied_at AS "appliedAt",
  notified_at AS "notifiedAt"
`;

export const LUMA_CONNECTION_SELECT = `
  id,
  user_id AS "userId",
  ics_url_encrypted AS "icsUrlEncrypted",
  ics_url_last_ok_at AS "icsUrlLastOkAt",
  status,
  preview_json AS "previewJson",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export type TopUpRow = {
  id: string;
  userId: string;
  packageId: string;
  amountUsdc: number;
  months: number;
  txHash: string;
  chainId: number;
  walletFrom: string;
  creditedUntil: Date | null;
  createdAt: Date;
};

export const TOPUP_SELECT = `
  id,
  user_id AS "userId",
  package_id AS "packageId",
  amount_usdc AS "amountUsdc",
  months,
  tx_hash AS "txHash",
  chain_id AS "chainId",
  wallet_from AS "walletFrom",
  credited_until AS "creditedUntil",
  created_at AS "createdAt"
`;

export const USER_PROFILE_SELECT = `
  id,
  user_id AS "userId",
  headline,
  bio,
  company,
  seniority,
  skills_json AS "skillsJson",
  tech_stack_json AS "techStackJson",
  interests_json AS "interestsJson",
  locations_json AS "locationsJson",
  event_types_json AS "eventTypesJson",
  keywords_json AS "keywordsJson",
  raw_source AS "rawSource",
  source_hash AS "sourceHash",
  selections_hash AS "selectionsHash",
  linkedin_snapshot_json AS "linkedinSnapshotJson",
  agent1_provider AS "agent1Provider",
  extracted_at AS "extractedAt",
  posts_synced_at AS "postsSyncedAt",
  age,
  life_status AS "lifeStatus",
  place_of_work_study AS "placeOfWorkStudy",
  agent_summary AS "agentSummary",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const PROFILE_POST_SELECT = `
  id,
  user_id AS "userId",
  content,
  content_hash AS "contentHash",
  source,
  posted_at AS "postedAt",
  topics_json AS "topicsJson",
  created_at AS "createdAt"
`;

export const KNOWLEDGE_NODE_SELECT = `
  id,
  user_id AS "userId",
  kind,
  key,
  label,
  props_json AS "propsJson",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const KNOWLEDGE_EDGE_SELECT = `
  id,
  user_id AS "userId",
  from_node_id AS "fromNodeId",
  to_node_id AS "toNodeId",
  relation,
  weight,
  props_json AS "propsJson",
  created_at AS "createdAt"
`;