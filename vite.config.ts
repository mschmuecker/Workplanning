import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: repository ? `/${repository}/` : "/",
  plugins: [react()],
});
