import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../app/data/combat-skills.json", import.meta.url), "utf8"));

test("extraction contains the full current martial-art table", () => {
  assert.equal(data.meta.skillCount, data.skills.length);
  assert.ok(data.skills.length >= 900);
  assert.ok(data.skills.every((skill) => skill.direct.analysis && skill.reverse.analysis));
});

test("released-game loadout geometry is extracted from the client", () => {
  assert.deepEqual(data.ui.maxSlotCounts, [9, 9, 9, 9, 9]);
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
  assert.equal(data.meta.schemaVersion, 2);
  assert.ok(data.meta.analysisStats.codeLogicOperationCount > 8000);
  assert.ok(data.meta.analysisStats.codeLogicConditionCount > 4000);
  assert.ok(effects.every((effect) => {
    const logic = effect.analysis.logic;
    return logic && (logic.events.length || logic.conditions.length || logic.operations.length || logic.affectedFields.length);
  }));
});

test("tooltip-omitted old-injury behavior remains one automatically detected case", () => {
  const jiuSe = data.skills.find((skill) => skill.id === 287);
  assert.ok(jiuSe.direct.tags.includes("현재부상만"));
  assert.ok(jiuSe.reverse.tags.includes("현재부상만"));
  assert.equal(jiuSe.codeVerified, true);
  assert.ok(jiuSe.direct.analysis.logic.operations.some((operation) => operation.symbol === "Subtract" && operation.resources.includes("오래된 부상")));
});

test("weapon range and trick requirements are joined to martial arts", () => {
  const daLiKaiBeiZhang = data.skills.find((skill) => skill.id === 356);
  assert.equal(daLiKaiBeiZhang.combat.recommendedWeaponName, "완철장투");
  assert.deepEqual(daLiKaiBeiZhang.combat.trickCost, [{ trickId: 6, name: "튕기기", nameCn: "崩", count: 3 }]);
  assert.equal(daLiKaiBeiZhang.combat.minDistance, 20);
  assert.equal(daLiKaiBeiZhang.combat.maxDistance, 60);
  assert.ok(daLiKaiBeiZhang.combat.compatibleWeaponGroups.length > 0);
});
