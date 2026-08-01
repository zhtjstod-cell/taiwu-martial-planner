import assert from "node:assert/strict";
import test from "node:test";
import { extractCodeLogic, selectModeCode } from "../extractor/code-ir.mjs";

const sample = `
// inheritance:0:ExampleSkill
public class ExampleSkill {
  void Apply() {
    if (base.IsDirect) {
      if (base.CombatChar.GetPoison() >= 3) base.CombatChar.AddPoison(2);
    } else {
      Enemy.RemovePoison(4);
    }
  }
}`;

test("direct and reverse branches are separated before relation extraction", () => {
  assert.match(selectModeCode(sample, "direct"), /AddPoison/);
  assert.doesNotMatch(selectModeCode(sample, "direct"), /RemovePoison/);
  assert.match(selectModeCode(sample, "reverse"), /RemovePoison/);
  assert.doesNotMatch(selectModeCode(sample, "reverse"), /AddPoison/);
});

test("code IR records conditions, targets, resources and operations", () => {
  const direct = extractCodeLogic(sample, "direct");
  const reverse = extractCodeLogic(sample, "reverse");
  assert.ok(direct.conditions.some((condition) => condition.resources.includes("독")));
  assert.ok(direct.operations.some((operation) => operation.verb === "produces" && operation.resources.includes("독") && operation.target === "자신"));
  assert.ok(reverse.operations.some((operation) => operation.verb === "clears" && operation.resources.includes("독") && operation.target === "적"));
});

test("봉금 mutation is separated from bannable-skill queries and unrelated Disable calls", () => {
  const logic = extractCodeLogic(`
// inheritance:0:BanExample
void Apply() {
  var ids = Enemy.GetRandomUnrepeatedBanableSkillIds(Random, 3);
  Enemy.SilenceSkill(ids[0], 20);
  base.CombatChar.DisableJumpMove();
}`, "direct");
  assert.ok(logic.operations.some((operation) => operation.symbol === "SilenceSkill" && operation.verb === "produces" && operation.resources.includes("봉금") && operation.target === "적"));
  assert.ok(!logic.operations.some((operation) => operation.symbol === "GetRandomUnrepeatedBanableSkillIds"));
  assert.ok(!logic.operations.some((operation) => operation.symbol === "DisableJumpMove" && operation.resources.includes("봉금")));
});
