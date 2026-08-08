/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
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
