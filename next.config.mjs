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
