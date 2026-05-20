import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import tsparser from "@typescript-eslint/parser";
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
          brands: ["Weave", "Obsidian", "Markdown"],
          acronyms: ["AI", "API", "HTTP", "HTTPS", "IR", "PDF", "EPUB", "PDF++", "UUID", "URL", "YAML"],
        },
      ],
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-this-alias": "off",
      "import/no-extraneous-dependencies": "off",
      "no-undef": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-control-regex": "off",
      "no-misleading-character-class": "off",
      "no-constant-condition": "off",
    },
  },
]);
