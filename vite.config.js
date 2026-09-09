import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

function htmlInputs(dir) {
  return Object.fromEntries(
    readdirSync(resolve(process.cwd(), dir))
      .filter((name) => name.endsWith(".html"))
      .map((name) => [
        name.replace(/\.html$/, ""),
        resolve(process.cwd(), dir, name)
      ])
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    define: {
      __HOMEKEEP_API_BASE_URL__: JSON.stringify(
        env.VITE_API_BASE_URL || "http://localhost:5000"
      )
    },
    build: {
      rollupOptions: {
        input: {
          login: resolve(process.cwd(), "index.html"),
          ...Object.fromEntries(
            Object.entries(htmlInputs("console")).map(([k, v]) => [
              `console-${k}`,
              v
            ])
          ),
          ...Object.fromEntries(
            Object.entries(htmlInputs("admin")).map(([k, v]) => [
              `admin-${k}`,
              v
            ])
          ),
          ...Object.fromEntries(
            Object.entries(htmlInputs("auth")).map(([k, v]) => [
              `auth-${k}`,
              v
            ])
          )
        }
      }
    }
  };
});
