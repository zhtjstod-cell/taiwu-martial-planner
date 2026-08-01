import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../app/data/combat-skills.json", import.meta.url), "utf8"));
const skillShards = await Promise.all(Array.from({ length: manifest.meta.skillShardCount }, async (_, index) =>
  JSON.parse(await readFile(new URL(`../app/data/combat-skills-${index}.json`, import.meta.url), "utf8"))
));
const data = { ...manifest, skills: skillShards.flat() };

test("extraction contains the full current martial-art table", () => {
  assert.equal(data.meta.skillCount, data.skills.length);
  assert.ok(data.skills.length >= 900);
  assert.ok(data.skills.every((skill) => skill.direct.analysis && skill.reverse.analysis));
});

test("released-game loadout geometry is extracted from the client", () => {
  assert.deepEqual(data.ui.maxSlotCounts, [9, 9, 9, 9, 9]);
  assert.deepEqual(data.ui.initialSlotCounts, [6, 1, 1, 1, 1, 0]);
  assert.equal(data.ui.totalSlotCount, 45);
  assert.deepEqual(data.ui.slotVisualSize, { width: 186, height: 200 });
  assert.equal(data.ui.supportsGenericGridAllocation, true);
  assert.equal(data.ui.supportsMultiplePlans, true);
});

test("every described effect retains a dynamic mechanic axis", () => {
  const effects = data.skills.flatMap((skill) => [skill.direct, skill.reverse]);
  const described = effects.filter((effect) => effect.description);
  assert.ok(described.length >= 1500);
  assert.ok(described.every((effect) => effect.analysis.mechanicAxes.length > 0));
});

test("every effect receives inherited code logic instead of one-off exceptions", () => {
  const effects = data.skills.flatMap((skill) => [skill.direct, skill.reverse]);
  assert.equal(data.meta.schemaVersion, 4);
  assert.ok(data.meta.analysisStats.codeLogicOperationCount > 8000);
  assert.ok(data.meta.analysisStats.codeLogicConditionCount > 4000);
  assert.ok(effects.every((effect) => {
    const logic = effect.analysis.logic;
    return logic && (logic.events.length || logic.conditions.length || logic.operations.length || logic.affectedFields.length);
  }));
});

test("official Korean names and mastery slot trade-offs come from game data", () => {
  assert.equal(data.skills.find((skill) => skill.id === 0).name, "패연결");
  assert.ok(data.skills.every((skill) => skill.grade === 9 - skill.gradeIndex));
  assert.equal(data.skills.find((skill) => skill.gradeIndex === 8).grade, 1);
  assert.deepEqual([...new Set(data.skills.map((skill) => skill.equipName))].sort(), ["경령", "기교", "내공", "파괴", "호체"]);
  assert.equal(data.skills.find((skill) => skill.id === 1).typeName, "신법");
  assert.equal(data.skills.find((skill) => skill.sect === 5).sectName, "원산파");
  assert.ok(data.skills.every((skill) => skill.masteredGridCost === Math.max(skill.gridCost - 1, 1)));
  assert.ok(data.skills.filter((skill) => skill.equipType === 0).every((skill) => skill.specificGrids.length <= 4 && Number.isInteger(skill.genericGrid)));
});

test("every recommendation has a target-aware causal proof", () => {
  const harmful = new Set(["직접 피해", "피해", "외상", "내상", "중상", "부상", "오래된 부상", "파열", "봉혈", "실신", "필사 표식", "패배 표식", "독", "독 등급", "고독", "내식 문란", "약화 상태", "봉금", "무기 내구도"]);
  const inverse = new Set(["clears", "reduces", "prevents", "consumes"]);
  const byId = new Map(data.skills.map((skill) => [skill.id, skill]));
  assert.equal(data.meta.relationAudit.missingEvidenceCount, 0);
  assert.ok(data.meta.relationAudit.rejectedOpponentHealingEdges > 0);
  for (const selected of data.skills) {
    for (const selectedMode of ["direct", "reverse"]) {
      for (const relation of selected.relations[selectedMode].counter) {
        assert.ok(relation.evidence && relation.reason && relation.basis);
        const candidate = byId.get(relation.skillId);
        const candidateEdges = candidate[relation.mode].analysis.semanticEdges;
        if (relation.basis === "defensive-inverse") {
          assert.ok(candidateEdges.some((edge) => inverse.has(edge.verb) && edge.target === "자신" && edge.resource === relation.resource));
        } else if (["buff-denial", "requirement-denial"].includes(relation.basis)) {
          assert.ok(candidateEdges.some((edge) => inverse.has(edge.verb) && edge.target === "적" && edge.resource === relation.resource && !harmful.has(edge.resource)));
        } else if (relation.basis === "old-injury-bypass") {
          assert.ok(candidateEdges.some((edge) => ["produces", "amplifies"].includes(edge.verb) && edge.target === "적" && edge.resource === "오래된 부상"));
        } else if (relation.basis === "element-denial") {
          assert.ok(candidate[relation.mode].analysis.banControl.deniedElements.includes(selected.elementName));
        } else if (relation.basis === "element-weakening") {
          assert.ok(candidate[relation.mode].analysis.banControl.weakenedElements.includes(selected.elementName));
        } else if (relation.basis === "ban-resistance") {
          assert.equal(selected[selectedMode].analysis.banControl.creates, true);
          assert.ok(candidate[relation.mode].analysis.banControl.resists || candidate[relation.mode].analysis.banControl.clears);
        } else {
          assert.equal(relation.basis, "range-control");
        }
      }
    }
  }
});

test("enemy healing is never reinterpreted as a counter", () => {
  const harmful = new Set(["직접 피해", "피해", "외상", "내상", "중상", "부상", "오래된 부상", "파열", "봉혈", "실신", "필사 표식", "패배 표식", "독", "독 등급", "고독", "내식 문란", "약화 상태", "봉금", "무기 내구도"]);
  const inverse = new Set(["clears", "reduces", "prevents", "consumes"]);
  const invalidEdges = data.skills.flatMap((skill) => [skill.direct, skill.reverse]).flatMap((effect) => effect.analysis.semanticEdges)
    .filter((edge) => inverse.has(edge.verb) && edge.target === "적" && harmful.has(edge.resource));
  assert.equal(invalidEdges.length, data.meta.relationAudit.rejectedOpponentHealingEdges);
});

test("element-specific 봉금 and weakening generate scoped counters without Disable false positives", () => {
  const byId = new Map(data.skills.map((skill) => [skill.id, skill]));
  const expected = new Map([
    [349, ["금강", "자하", "순양"]],
    [483, ["귀원", "순양", "현음"]],
    [580, ["귀원", "자하", "현음"]],
    [587, ["금강", "순양", "현음"]],
    [620, ["금강", "귀원", "자하"]],
  ]);
  for (const [skillId, elements] of expected) {
    const skill = byId.get(skillId);
    assert.deepEqual([...skill.direct.analysis.banControl.deniedElements].sort(), [...elements].sort());
    assert.deepEqual([...skill.reverse.analysis.banControl.weakenedElements].sort(), [...elements].sort());
  }
  const guiYuanSkill = data.skills.find((skill) => skill.elementName === "귀원" && !expected.has(skill.id));
  assert.ok(guiYuanSkill.relations.direct.counter.some((relation) => relation.skillId === 580 && relation.mode === "direct" && relation.basis === "element-denial"));
  const falseBanEvidence = data.skills.flatMap((skill) => [skill.direct, skill.reverse]).flatMap((effect) => effect.analysis.semanticEdges)
    .filter((edge) => edge.resource === "봉금" && /DisableJumpMove/i.test(edge.evidence));
  assert.deepEqual(falseBanEvidence, []);
});

test("봉금 sources connect to duration/exploit synergies and real resistance counters", () => {
  const shinCheok = data.skills.find((skill) => skill.id === 580);
  assert.ok(shinCheok.relations.direct.synergy.some((relation) => relation.basis === "ban-chain"));
  assert.ok(shinCheok.relations.direct.counter.some((relation) => relation.basis === "ban-resistance" && [33, 51, 53, 82, 96, 112].includes(relation.skillId)));
});

test("tooltip-omitted old-injury behavior remains one automatically detected case", () => {
  const jiuSe = data.skills.find((skill) => skill.id === 287);
  assert.ok(jiuSe.direct.tags.includes("현재부상만"));
  assert.ok(jiuSe.reverse.tags.includes("현재부상만"));
  assert.equal(jiuSe.codeVerified, true);
  assert.ok(jiuSe.direct.analysis.logic.operations.some((operation) => operation.symbol === "Subtract" && operation.resources.includes("오래된 부상")));
  const counters = jiuSe.relations.direct.counter;
  assert.ok(counters.some((relation) => relation.basis === "old-injury-bypass"));
  assert.ok(counters.some((relation) => relation.basis === "requirement-denial" && [52, 559].includes(relation.skillId) && relation.resource === "기교 진기"));
});

test("weapon range and trick requirements are joined to martial arts", () => {
  const daLiKaiBeiZhang = data.skills.find((skill) => skill.id === 356);
  assert.equal(daLiKaiBeiZhang.combat.recommendedWeaponName, "완철장투");
  assert.deepEqual(daLiKaiBeiZhang.combat.trickCost, [{ trickId: 6, name: "붕", nameCn: "崩", count: 3 }]);
  assert.equal(daLiKaiBeiZhang.combat.minDistance, 20);
  assert.equal(daLiKaiBeiZhang.combat.maxDistance, 60);
  assert.ok(daLiKaiBeiZhang.combat.compatibleWeaponGroups.length > 0);
});
