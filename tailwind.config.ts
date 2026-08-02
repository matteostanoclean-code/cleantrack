import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-stamp)", "ui-monospace", "monospace"]
      },
      colors: {
        // Neutral white/porcelain surfaces, matching the reference app exactly.
        paper: {
          50: "#FFFFFF",
          100: "#F6F7F9",
          200: "#EEF0F3",
          300: "#E1E4E9"
        },
        ink: {
          900: "#0F1720",
          800: "#1A2430",
          600: "#4B5563",
          400: "#6B7280",
          200: "#9CA3AF"
        },
        // Primary accent — the blue from the reference screenshots.
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          300: "#8FC0FB",
          500: "#2F6FED",
          600: "#1D5FE0",
          700: "#1547B0"
        },
        amber: {
          100: "#FCEFD8",
          500: "#C97A1A",
          700: "#8F5610"
        },
        rose: {
          100: "#FBE4E4",
          500: "#C24444",
          700: "#93302F"
        }
      },
      boxShadow: {
        glow: "0 8px 24px -6px rgba(29, 95, 224, 0.35)",
        card: "0 1px 2px rgba(15, 23, 32, 0.04), 0 6px 16px -8px rgba(15, 23, 32, 0.10)"
      },
      backgroundImage: {
        "stamp-lines": "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(17,27,21,0.035) 3px, rgba(17,27,21,0.035) 4px)"
      }
    }
  },
  plugins: []
};

export default config;
