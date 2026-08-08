/**
 * Public Luma discover feeds used for personalized event lists.
 * Slugs match https://luma.com/<slug>
 */

export const LUMA_LOCATION_FEEDS: Record<
  string,
  { slug: string; placeApiId: string; url: string }
> = {
  London: {
    slug: "london",
    placeApiId: "discplace-QCcNk3HXowOR97j",
    url: "https://luma.com/london",
  },
  Amsterdam: {
    slug: "amsterdam",
    placeApiId: "discplace-FC4SDMUVXiFtMOr",
    url: "https://luma.com/amsterdam",
  },
  Barcelona: {
    slug: "barcelona",
    placeApiId: "discplace-WcS4REeayDPXV4n",
    url: "https://luma.com/barcelona",
  },
  Berlin: {
    slug: "berlin",
    placeApiId: "discplace-gCfX0s3E9Hgo3rG",
    url: "https://luma.com/berlin",
  },
  Copenhagen: {
    slug: "copenhagen",
    placeApiId: "discplace-CmmHAjPdBSsqmJf",
    url: "https://luma.com/copenhagen",
  },
};

export const LUMA_TOPIC_FEEDS: Record<
  string,
  { slug: string; categoryApiId: string; url: string; keywords: string[] }
> = {
  AI: {
    slug: "ai",
    categoryApiId: "cat-ai",
    url: "https://luma.com/ai",
    keywords: ["ai", "llm", "machine learning", "artificial intelligence", "gpt"],
  },
  Tech: {
    slug: "tech",
    categoryApiId: "cat-tech",
    url: "https://luma.com/tech",
    keywords: ["tech", "software", "developer", "engineering", "startup", "hackathon"],
  },
  Crypto: {
    slug: "crypto",
    categoryApiId: "cat-crypto",
    url: "https://luma.com/crypto",
    keywords: ["crypto", "web3", "blockchain", "bitcoin", "ethereum", "defi", "nft"],
  },
  "Food & Drinks": {
    slug: "food",
    categoryApiId: "cat-fooddrink",
    url: "https://luma.com/food",
    keywords: ["food", "drink", "drinks", "brunch", "cocktail", "dinner", "cafe"],
  },
  "Arts & Culture": {
    slug: "arts",
    categoryApiId: "cat-AzVAf6VmE9JEre4",
    url: "https://luma.com/arts",
    keywords: ["art", "arts", "culture", "music", "gallery", "theatre", "design"],
  },
};
