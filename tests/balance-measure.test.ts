import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { runBalanceReport } from "../src/league/balance";

describe("balance measurement dump", () => {
  it("writes the field report only when MUTTPIT_BALANCE_OUT is set", () => {
    const report = runBalanceReport();
    const out = process.env.MUTTPIT_BALANCE_OUT;
    if (out) {
      writeFileSync(out, JSON.stringify(report, null, 2));
    }
    for (const a of report.archetypes) {
      if (!(a.winRate >= 0 && a.winRate <= 1)) {
        throw new Error(`winRate out of range for ${a.label}: ${a.winRate}`);
      }
    }
  }, 120000);
});
