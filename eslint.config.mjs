import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "lib/db/migrations.generated.ts"] },
  // As miniaturas do Instagram vêm de um CDN externo (liberado na CSP): <img> é o correto aqui.
  { files: ["app/(app)/relatorios/**/*.tsx"], rules: { "@next/next/no-img-element": "off" } },
];
export default config;
