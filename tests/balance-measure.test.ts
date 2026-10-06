import { describe, it } from "vitest";
import { runBalanceReport } from "../src/league/balance";

// node interop without @types/node (no new deps): dynamic specifier + global shim.
const nodeFs = (await import("node:" + "fs")) as unknown as {
  writeFileSync(path: string, data: string): void;
};
const nodeEnv =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env ?? {};

describe("balance measurement dump", () => {
  it("writes the field report only when MUTTPIT_BALANCE_OUT is set", () => {
    const report = runBalanceReport();
    const out = nodeEnv.MUTTPIT_BALANCE_OUT;
    if (out) {
      nodeFs.writeFileSync(out, JSON.stringify(report, null, 2));
    }
    for (const a of report.archetypes) {
      if (!(a.winRate >= 0 && a.winRate <= 1)) {
        throw new Error(`winRate out of range for ${a.id}: ${a.winRate}`);
      }
    }
  }, 120000);
});
