/** Event cities the user can target during registration. */
export const EVENT_LOCATIONS = [
  "London",
  "Amsterdam",
  "Barcelona",
  "Berlin",
  "Copenhagen",
] as const;

/** Event topic interests during registration. */
export const EVENT_INTERESTS = [
  "Tech",
  "AI",
  "Crypto",
  "Food & Drinks",
  "Arts & Culture",
] as const;

/** Skills selectable during registration (rounded buttons). */
export const PROFILE_SKILLS = [
  "Software developer",
  "AI analyst",
  "Agentic software",
  "Full-stack engineer",
  "Frontend engineer",
  "Backend engineer",
  "Product designer",
  "Data scientist",
  "ML engineer",
  "DevOps / infra",
  "Growth / marketing",
  "Founder",
  "Community builder",
  "Researcher",
  "Product manager",
] as const;

export const TECH_STACK = [
  "TypeScript",
  "Python",
  "React",
  "Next.js",
  "Node.js",
  "Rust",
  "Go",
  "Solidity",
  "PostgreSQL",
  "Prisma",
  "AWS",
  "Docker",
  "PyTorch",
  "LangChain",
];

export const INTERESTS = [...EVENT_INTERESTS];

export const SENIORITY_OPTIONS = [
  "Student",
  "Junior (0–2 yrs)",
  "Mid (2–5 yrs)",
  "Senior (5+ yrs)",
  "Staff / Principal",
  "Founder",
  "Investor",
];

export const EVENT_TYPES = [
  "Hackathons",
  "Meetups",
  "Conferences",
  "Workshops",
  "Demo days",
  "Networking mixers",
  "Fireside chats",
  "Build nights",
];

export const MIN_CHIP_PICKS = 1;
export const MIN_WRITING_SAMPLES = 3;
export const MAX_WRITING_SAMPLES = 5;

export type FloatingCategoryId = "location" | "interests" | "skills";

export const FLOATING_CATEGORIES: {
  id: FloatingCategoryId;
  title: string;
  subtitle: string;
  options: readonly string[];
}[] = [
  {
    id: "location",
    title: "Where do you want events?",
    subtitle: "Pick one or more cities we should prioritize.",
    options: EVENT_LOCATIONS,
  },
  {
    id: "interests",
    title: "What are you into?",
    subtitle: "Choose topics for the events we match you to.",
    options: EVENT_INTERESTS,
  },
  {
    id: "skills",
    title: "What are your skills?",
    subtitle: "Select the roles that best describe you.",
    options: PROFILE_SKILLS,
  },
];
