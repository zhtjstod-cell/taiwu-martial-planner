import assert from "node:assert/strict";
import test from "node:test";
import { extractCodeLogic, selectModeCode } from "../extractor/code-ir.mjs";
import { assembleEffectCode } from "../extractor/code-composition.mjs";
import { bindConfigArguments, constructorFields } from "../extractor/config-schema.mjs";

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

test("composed implementations retain their own and inherited battle mutations", () => {
  const root = { path: "/fx/Root.cs", source: "public class Root : Generic { object Implements() { return new PoisonImpl(); } }" };
  const child = { path: "/fx/PoisonImpl.cs", source: "public class PoisonImpl : PoisonBase { }" };
  const parent = { path: "/fx/PoisonBase.cs", source: "public class PoisonBase : ISpecialEffectImplement {\nvoid Apply() {\nEnemy.AddPoison(2);\n}\n}" };
  const generic = { path: "/fx/Generic.cs", source: "public class Generic {\nvoid Unused() {\nEnemy.RemoveOldInjury();\n}\n}" };
  const index = new Map([["PoisonImpl", [child]], ["PoisonBase", [parent]], ["Generic", [generic]]]);
  const logic = extractCodeLogic(assembleEffectCode(root, index), "direct");
  assert.ok(logic.operations.some((operation) => operation.symbol === "AddPoison" && operation.target === "적"));
  assert.ok(!logic.operations.some((operation) => operation.symbol === "RemoveOldInjury"));
});

test("constructor schema binds named fields and fails safely on field count drift", () => {
  const fields = constructorFields("public Example(short id, List<int> values, string name) { }", "Example");
  assert.deepEqual(fields, ["id", "values", "name"]);
  assert.deepEqual(bindConfigArguments(fields, ["id: 1", "new List<int>()", '"이름"'], "Example"), { id: "1", values: "new List<int>()", name: '"이름"' });
  assert.throws(() => bindConfigArguments(fields, ["1", '"이름"'], "Example"), /필드 수가 일치하지/);
});

test("poison recipient aliases, injury worsening and range are not event-wiring or stance effects", () => {
  const logic = extractCodeLogic(`// inheritance:0:PoisonImpl
public void Apply(DataContext context) {
  CombatCharacter combatChar = EffectBase.CombatChar;
  CombatCharacter combatCharacter = DomainManager.Combat.GetCombatCharacter(!combatChar.IsAlly);
  DomainManager.Combat.AddPoison(context, combatChar, combatCharacter, 0, 3, 1800);
  DomainManager.Combat.ChangeDistance(context, EffectBase.CombatChar, 10);
  defender.WorsenInjury(context, 1, inner: true, 160);
  Events.RegisterHandler_AddDirectDamageValue(OnDamage);
}`, "direct");
  assert.ok(logic.operations.some((operation) => operation.symbol === "AddPoison" && operation.target === "적"));
  assert.ok(logic.operations.some((operation) => operation.symbol === "WorsenInjury" && operation.verb === "amplifies" && operation.resources.includes("내상")));
  assert.ok(!logic.operations.some((operation) => operation.symbol === "ChangeDistance" && operation.resources.includes("자세")));
  assert.ok(!logic.operations.some((operation) => /RegisterHandler/.test(operation.symbol)));
});
