import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    env: {
      DB_HOST: process.env.DB_HOST ?? "127.0.0.1",
      DB_PORT: process.env.DB_PORT ?? "3306",
      DB_NAME: process.env.DB_TEST_NAME ?? "nova_berith_test",
      DB_USER: process.env.DB_USER ?? "berith",
      DB_PASSWORD: process.env.DB_PASSWORD ?? "dev_only_senha",
      REDES_ATIVAS: "instagram,facebook,tiktok,youtube", // testes cobrem a lógica multi-rede; o produto usa só o Instagram
      SESSION_SECRET: "test-secret-test-secret-test-secret-test-secret-12345",
    },
  },
});
