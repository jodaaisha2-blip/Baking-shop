import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api requests go to the FastAPI email service; everything else talks
// to Supabase directly from the browser.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
