import test from "node:test";
import assert from "node:assert/strict";
import { chooseSigningPlan } from "./contract_decision.ts";

test("signing plan keeps one document key for storage and the expiring link", () => {
  const plan = chooseSigningPlan({ contractName: "agent-tools", pdf: "pdf", cert_pem: "cert", key_pem: "key" });
  assert.equal(plan.key, "contracts/agent-tools.pdf");
  assert.equal(plan.signBody.retention_days, 30);
  assert.equal(plan.signBody.pdf, "pdf");
});
