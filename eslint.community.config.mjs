/**
 * Community review mirror — Obsidian eslint-plugin-obsidianmd 0.3.x scorecard profile.
 * Severities align with the 2026 developer dashboard (Required = error, Optional = warn).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import tsparser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "backup-before-migration/**",
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "src/**/__tests__/**",
      "src/demo/**",
      "src/tests/**",
      "src/**/*.d.ts",
      "src/services/epub-integration/vendor/**",
    ],
  },
  ...obsidianmd.configs.recommendedWithLocalesEn,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: configDir,
      },
      globals: {
        __WEAVE_LEGACY_APKG_RUNTIME__: "readonly",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          brands: ["Weave", "Obsidian", "Markdown", "Anki", "FSRS", "EPUB", "CalDAV", "WebDAV", "WDeck", "Wdeck"],
          acronyms: [
            "AI",
            "API",
            "HTTP",
            "HTTPS",
            "IR",
            "PDF",
            "UUID",
            "URL",
            "YAML",
            "JSON",
            "SQL",
            "UI",
            "UX",
            "ID",
            "APKG",
            "CSV",
            "HTML",
            "CSS",
            "DOM",
            "OS",
            "iOS",
            "ADB",
            "BRAT",
          ],
          enforceCamelCaseLower: true,
        },
      ],
      // Dashboard "Optional" — type-safety & hygiene (still affects scorecard).
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-enum-comparison": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-useless-escape": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
]);
