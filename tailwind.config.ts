import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0c10",
          900: "#10141c",
          800: "#171d29",
          700: "#222a3a",
          600: "#334057",
        },
        lumen: {
          50: "#fff8eb",
          100: "#ffefc7",
          200: "#ffdd8a",
          300: "#ffc547",
          400: "#f5a623",
          500: "#e08a0d",
          600: "#c26b08",
        },
        mist: {
          100: "#e8eef8",
          200: "#c5d2e8",
          300: "#9aacc8",
          400: "#6b7f9e",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "aurora":
          "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(245,166,35,0.22), transparent 55%), radial-gradient(ellipse 60% 50% at 85% 20%, rgba(100,140,220,0.18), transparent 50%), radial-gradient(ellipse 70% 60% at 50% 90%, rgba(245,166,35,0.12), transparent 55%)",
        "grain":
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      animation: {
        "float": "float 8s ease-in-out infinite",
        "pulse-soft": "pulseSoft 3s ease-in-out infinite",
        "shimmer": "shimmer 2.4s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
