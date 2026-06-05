import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f3efe8",
        ink: "#202027",
        muted: "#77717b",
        line: "#ebe4da"
      },
      boxShadow: {
        card: "0 18px 45px rgba(67, 56, 45, 0.08)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
