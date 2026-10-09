export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { ensureReady } = await import("./lib/db");
    await ensureReady(); // falha explícita impede o servidor de liberar o app
  }
}
