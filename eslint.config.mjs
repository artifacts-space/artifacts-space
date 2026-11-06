import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      complexity: ["error", { max: 10 }],
      "max-lines": ["error", { max: 500, skipBlankLines: false, skipComments: false }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // `||` stays allowed on strings: an empty string should fall back too.
      "@typescript-eslint/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
      // Font sizes come from the type scale in globals.css: text-xs, text-sm, text-md, text-base.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|[\\s:])text-\\[[0-9.]+(px|rem|em)\\]/]",
          message: "Use a type scale step (text-xs, text-sm, text-md, text-base) instead of an arbitrary font size.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|[\\s:])text-\\[[0-9.]+(px|rem|em)\\]/]",
          message: "Use a type scale step (text-xs, text-sm, text-md, text-base) instead of an arbitrary font size.",
        },
      ],
    },
  },
  {
    // Config and script files run outside the app's type program.
    files: ["**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
