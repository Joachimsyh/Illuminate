/**
 * Extract contact / social links from LinkedIn profile text (or CV paste).
 * Used to auto-fill Luma registration questions — never invent handles.
 */

export type LinkedInSocials = {
  linkedin: string | null;
  github: string | null;
  twitter: string | null;
  x: string | null;
  instagram: string | null;
  website: string | null;
  portfolio: string | null;
  youtube: string | null;
  medium: string | null;
  /** Flat map for form matching */
  byLabel: Record<string, string>;
};

function cleanUrl(url: string): string {
  return url.trim().replace(/[),.;]+$/, "").replace(/\/$/, "");
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] || m?.[0] || null;
}

/**
 * Parse LinkedIn / CV free text for social + personal URLs and named handles.
 */
export function extractLinkedInSocials(
  text: string,
  opts?: { linkedinFallback?: string | null }
): LinkedInSocials {
  const hay = text || "";

  let linkedin =
    firstMatch(
      hay,
      /https?:\/\/(?:www\.|uk\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?/i
    ) || null;
  if (linkedin) linkedin = cleanUrl(linkedin);
  else if (opts?.linkedinFallback) linkedin = cleanUrl(opts.linkedinFallback);

  // Explicit "GitHub Name: foo" (common on Faizan-style headlines)
  const ghName =
    firstMatch(
      hay,
      /GitHub\s*Name\s*:\s*([A-Za-z0-9](?:[A-Za-z0-9\-]|-(?=[A-Za-z0-9])){0,38})/i
    ) ||
    firstMatch(
      hay,
      /GitHub\s*:\s*@?([A-Za-z0-9](?:[A-Za-z0-9\-]|-(?=[A-Za-z0-9])){0,38})/i
    );

  let github =
    firstMatch(
      hay,
      /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9\-]|-(?=[A-Za-z0-9])){0,38})\/?/i
    ) || null;
  if (github && !github.startsWith("http")) {
    github = `https://github.com/${github}`;
  } else if (github) {
    github = cleanUrl(github);
  } else if (ghName) {
    github = `https://github.com/${ghName}`;
  }

  let twitter =
    firstMatch(
      hay,
      /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/?/i
    ) || null;
  if (twitter && !twitter.startsWith("http")) {
    twitter = `https://x.com/${twitter}`;
  } else if (twitter) {
    twitter = cleanUrl(twitter);
  }
  const twHandle = firstMatch(
    hay,
    /(?:Twitter|X(?:\/Twitter)?)\s*(?:handle|user(?:name)?)?\s*:\s*@?([A-Za-z0-9_]{1,15})/i
  );
  if (!twitter && twHandle) twitter = `https://x.com/${twHandle}`;

  let instagram =
    firstMatch(
      hay,
      /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?/i
    ) || null;
  if (instagram && !instagram.startsWith("http")) {
    instagram = `https://instagram.com/${instagram}`;
  } else if (instagram) {
    instagram = cleanUrl(instagram);
  }

  let youtube =
    firstMatch(
      hay,
      /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:@|channel\/|c\/)?[A-Za-z0-9_\-]+|youtu\.be\/[A-Za-z0-9_\-]+)\/?/i
    ) || null;
  if (youtube) youtube = cleanUrl(youtube);

  let medium =
    firstMatch(
      hay,
      /https?:\/\/(?:www\.)?medium\.com\/@?[A-Za-z0-9_\-]+\/?/i
    ) || null;
  if (medium) medium = cleanUrl(medium);

  // Personal / portfolio sites (exclude known social hosts)
  const urlRe = /https?:\/\/[^\s)\]>"']+/gi;
  const urls = (hay.match(urlRe) || []).map(cleanUrl);
  const socialHosts =
    /linkedin\.com|github\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|youtu\.be|medium\.com|lu\.ma|google\.com|drive\.google|facebook\.com/i;
  const personal = urls.find((u) => !socialHosts.test(u)) || null;

  const portfolioLabel = firstMatch(
    hay,
    /(?:Portfolio|Personal\s+site|Website)\s*:\s*(https?:\/\/[^\s)+]+)/i
  );

  const website = portfolioLabel
    ? cleanUrl(portfolioLabel)
    : personal;
  const portfolio = portfolioLabel ? cleanUrl(portfolioLabel) : personal;

  const byLabel: Record<string, string> = {};
  if (linkedin) {
    byLabel.linkedin = linkedin;
    byLabel["linkedin url"] = linkedin;
    byLabel["linkedin profile"] = linkedin;
  }
  if (github) {
    byLabel.github = github;
    byLabel["github url"] = github;
    byLabel["github profile"] = github;
    byLabel["git hub"] = github;
  }
  if (twitter) {
    byLabel.twitter = twitter;
    byLabel["twitter url"] = twitter;
    byLabel["twitter/x"] = twitter;
    byLabel.x = twitter;
    byLabel["x url"] = twitter;
    byLabel["x (twitter)"] = twitter;
  }
  if (instagram) {
    byLabel.instagram = instagram;
    byLabel["instagram url"] = instagram;
  }
  if (website) {
    byLabel.website = website;
    byLabel["personal website"] = website;
    byLabel["personal site"] = website;
    byLabel.site = website;
    byLabel.url = website;
  }
  if (portfolio) {
    byLabel.portfolio = portfolio;
    byLabel["portfolio url"] = portfolio;
  }
  if (youtube) {
    byLabel.youtube = youtube;
    byLabel["youtube url"] = youtube;
  }
  if (medium) {
    byLabel.medium = medium;
  }

  return {
    linkedin,
    github,
    twitter,
    x: twitter,
    instagram,
    website,
    portfolio,
    youtube,
    medium,
    byLabel,
  };
}

/** Human-readable block for LLM / knowledge graph prompts. */
export function formatSocialsForAgent(socials: LinkedInSocials): string {
  const lines = [
    socials.linkedin ? `LinkedIn: ${socials.linkedin}` : null,
    socials.github ? `GitHub: ${socials.github}` : null,
    socials.twitter ? `Twitter/X: ${socials.twitter}` : null,
    socials.instagram ? `Instagram: ${socials.instagram}` : null,
    socials.website ? `Website: ${socials.website}` : null,
    socials.portfolio && socials.portfolio !== socials.website
      ? `Portfolio: ${socials.portfolio}`
      : null,
    socials.youtube ? `YouTube: ${socials.youtube}` : null,
    socials.medium ? `Medium: ${socials.medium}` : null,
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(no social links found in LinkedIn text)";
}
