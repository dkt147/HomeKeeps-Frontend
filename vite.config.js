import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { readdirSync, cpSync, mkdirSync } from "node:fs";

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

/**
 * Copy the shared assets into dist/shared after Vite finishes building.
 *
 * The application uses paths such as:
 *
 * /shared/js/config.js
 * /shared/js/auth.js
 * /shared/js/api.js
 * /shared/css/admin.css
 *
 * These files exist in the repository but were previously not copied
 * into the Vite production output.
 */
function copySharedAssets() {
  return {
    name: "homekeep-copy-shared-assets",

    closeBundle() {
      const source = resolve(process.cwd(), "shared");
      const destination = resolve(process.cwd(), "dist", "shared");

      mkdirSync(destination, { recursive: true });

      cpSync(source, destination, {
        recursive: true,
        force: true,
      });

      console.log("========================================");
      console.log("HomeKeep shared assets copied");
      console.log("Source:", source);
      console.log("Destination:", destination);
      console.log("========================================");
    },
  };
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

  /**
   * config.js is a classic <script>, not an ES module.
   *
   * Therefore Vite's `define` cannot directly inject the API URL
   * into config.js.
   *
   * We inject the value into every HTML page before config.js loads.
   */
  const injectApiUrl = {
    name: "homekeep-inject-api-url",

    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: `window.__HOMEKEEP_API_BASE_URL__ = ${JSON.stringify(
            apiBaseUrl
          )};`,
          injectTo: "head-prepend",
        },
      ];
    },
  };

  return {
    plugins: [
      injectApiUrl,
      copySharedAssets(),
    ],

    build: {
      rollupOptions: {
        input: {
          /**
           * Main staff login
           */
          login: resolve(process.cwd(), "index.html"),

          /**
           * Console pages
           */
          ...Object.fromEntries(
            Object.entries(htmlInputs("console")).map(([key, value]) => [
              `console-${key}`,
              value,
            ])
          ),

          /**
           * Admin pages
           */
          ...Object.fromEntries(
            Object.entries(htmlInputs("admin")).map(([key, value]) => [
              `admin-${key}`,
              value,
            ])
          ),

          /**
           * Auth pages
           */
          ...Object.fromEntries(
            Object.entries(htmlInputs("auth")).map(([key, value]) => [
              `auth-${key}`,
              value,
            ])
          ),
        },
      },
    },
  };
});