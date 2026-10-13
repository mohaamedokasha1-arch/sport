import next from "@next/eslint-plugin-next";
import hooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
// Syntax/control-flow linting across the existing project, without restyling legacy code.
export default [
  { ignores: [".next/**", "node_modules/**", "packages/sdl/dist*/**", "next-env.d.ts"] },
  { files: ["**/*.ts", "**/*.tsx"], languageOptions: { parser: tseslint.parser }, plugins: { "@next/next": next, "react-hooks": hooks }, linterOptions: { reportUnusedDisableDirectives: "off" }, rules: {
    "no-debugger": "error", "no-unreachable": "error", "no-constant-condition": ["error", { checkLoops: false }],
    "no-unsafe-finally": "error", "constructor-super": "error", "no-duplicate-case": "error",
  } },
];
