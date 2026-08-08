// Apply before NextAuth/openid-client HTTPS calls (LinkedIn OIDC).
if (
  process.env.SSL_NO_VERIFY === "1" &&
  process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "pg"],
  },
  serverExternalPackages: ["pdf-parse", "mammoth", "pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "**.licdn.com" },
      { protocol: "https", hostname: "images.lumacdn.com" },
      { protocol: "https", hostname: "cdn.lu.ma" },
    ],
  },
};

export default nextConfig;
