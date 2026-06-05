import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/College-project-Retail-Sales/",
  server: {
    port: 5173,
  },
});