import next from "eslint-config-next";

export default [...next, { ignores: [".next/**", "lib/db/migrations.generated.ts"] }];
