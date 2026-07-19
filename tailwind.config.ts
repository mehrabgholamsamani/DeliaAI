import type { Config } from "tailwindcss";

export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172126",
        mint: "#39bca3",
        aqua: "#c9f4ec",
        marigold: "#f5b942",
        cloud: "#f6fbfb"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 24px 70px rgba(23, 33, 38, 0.14)"
      }
    }
  },
  plugins: []
} satisfies Config;
