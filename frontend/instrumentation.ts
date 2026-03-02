export async function register() {
  console.log("[instrumentation] register called, runtime:", process.env.NEXT_RUNTIME)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("./instrumentation-node")
    } catch (err) {
      console.error("[instrumentation] failed to load instrumentation-node:", err)
    }
  }
}
