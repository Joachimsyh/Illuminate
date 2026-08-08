export type SkillCategory = {
  id: string;
  label: string;
  skills: string[];
};

/** Interest / skill catalog for onboarding (Fiverr-style picker). */
export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    id: "tech",
    label: "Tech & Building",
    skills: [
      "AI / Machine Learning",
      "Web Development",
      "Mobile Apps",
      "DevTools",
      "Cloud & Infra",
      "Cybersecurity",
      "Data Science",
      "Open Source",
    ],
  },
  {
    id: "startup",
    label: "Startup & Business",
    skills: [
      "Startups",
      "Founders",
      "Product Management",
      "Growth",
      "Fundraising",
      "Pitching",
      "Venture Capital",
      "Hackathons",
    ],
  },
  {
    id: "web3",
    label: "Web3 & Crypto",
    skills: [
      "Web3",
      "Blockchain",
      "DeFi",
      "NFTs",
      "Smart Contracts",
      "Monad",
      "Solidity",
    ],
  },
  {
    id: "creative",
    label: "Design & Creative",
    skills: [
      "UI / UX Design",
      "Brand Design",
      "Motion Design",
      "Content Creation",
      "Community",
      "Marketing",
    ],
  },
  {
    id: "career",
    label: "Career & Learning",
    skills: [
      "Networking",
      "Mentorship",
      "Career Switch",
      "Student",
      "Hiring",
      "Public Speaking",
    ],
  },
];

export const ALL_SKILLS = SKILL_CATEGORIES.flatMap((c) => c.skills);

export const MIN_SKILLS = 3;
export const MAX_SKILLS = 12;

export function skillsToKeywords(skills: string[]): string {
  return skills
    .map((s) =>
      s
        .toLowerCase()
        .replace(/\s*\/\s*/g, " ")
        .replace(/[^a-z0-9\s+]/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join(" ")
    )
    .filter(Boolean)
    .join(",");
}
