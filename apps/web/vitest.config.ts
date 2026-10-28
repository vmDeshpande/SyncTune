import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
  server: { port: 5173 },
});
