import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.SITE_BASE_PATH || "/J/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0" },
});
