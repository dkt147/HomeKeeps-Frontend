import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

function htmlInputs(dir) {
  return Object.fromEntries(
    readdirSync(resolve(process.cwd(), dir))
      .filter((name) => name.endsWith(".html"))
      .map((name) => [
        name.replace(/\.html$/, ""),
        resolve(process.cwd(), dir, name),
      ])
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  const apiBaseUrl =
    env.VITE_API_BASE_URL || "http://localhost:5000";

  console.log("========================================");
  console.log("HomeKeep Vite API Configuration");
  console.log("Mode:", mode);
  console.log("API Base URL:", apiBaseUrl);
  console.log("========================================");

  // config.js is a classic <script> (not a module), so Vite's `define`
  // never reaches it. Inject the URL into every HTML page instead.
  const injectApiUrl = {
    name: "homekeep-inject-api-url",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: `window.__HOMEKEEP_API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};`,
          injectTo: "head-prepend",
        },
      ];
    },
  };

  return {
    plugins: [injectApiUrl],

    build: {
      rollupOptions: {
        input: {
          login: resolve(process.cwd(), "index.html"),

          ...Object.fromEntries(
            Object.entries(htmlInputs("console")).map(([k, v]) => [
              `console-${k}`,
              v,
            ])
          ),

          ...Object.fromEntries(
            Object.entries(htmlInputs("admin")).map(([k, v]) => [
              `admin-${k}`,
              v,
            ])
          ),

          ...Object.fromEntries(
            Object.entries(htmlInputs("auth")).map(([k, v]) => [
              `auth-${k}`,
              v,
            ])
          ),
        },
      },
    },
  };
});