import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Runtime must stay extractable as a standalone package: no editor/app imports.
  {
    files: ["packages/runtime/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/editor",
                "@/editor/*",
                "@/app",
                "@/app/*",
                "**/editor/**",
                "**/app/**",
              ],
              message:
                "packages/runtime must not depend on editor or app code (see specs/00-overview.md).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "packages/*/dist/**",
    // standalone vite smoke-test app with its own lint setup (.oxlintrc.json)
    "packages/rt-npm-test/**",
  ]),
]);

export default eslintConfig;
