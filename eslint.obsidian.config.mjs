import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Day-to-day Obsidian lint: community recommended (0.3.x) with pragmatic
 * downgrades for legacy type-safety debt. Blocking Obsidian rules stay enabled.
 */
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
      "src/**/vendor/**",
      "src/**/*.js",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: configDir,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
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
        },
      ],
      // Legacy typing debt — tracked via lint:obsidian:community, not day-to-day gates.
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-deprecated": "warn",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-this-alias": "off",
      "import/no-extraneous-dependencies": "error",
      "no-undef": "off",
      "no-empty": "warn",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-control-regex": "off",
      "no-misleading-character-class": "off",
      "no-constant-condition": "off",
      "obsidianmd/prefer-active-doc": "warn",
      "obsidianmd/prefer-window-timers": "error",
      "obsidianmd/prefer-instanceof": "error",
      "obsidianmd/no-unsupported-api": "error",
      "obsidianmd/hardcoded-config-path": "error",
    },
  },
]);
