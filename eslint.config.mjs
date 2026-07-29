import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const compat=new FlatCompat({baseDirectory:here});
const eslintConfig=[
  ...compat.extends("next/core-web-vitals","next/typescript"),
  {ignores:[".next/**","node_modules/**","coverage/**","playwright-report/**","next-env.d.ts"]}
];
export default eslintConfig;
