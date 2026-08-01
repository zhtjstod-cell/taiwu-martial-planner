import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../app/data/combat-skills.json", import.meta.url), "utf8"));

test("extraction contains the full current martial-art table", () => {
  assert.equal(data.meta.skillCount, data.skills.length);
  assert.ok(data.skills.length >= 900);
  assert.ok(data.skills.every((skill) => skill.direct.analysis && skill.reverse.analysis));
});

test("every described effect retains a dynamic mechanic axis", () => {
  const effects = data.skills.flatMap((skill) => [skill.direct, skill.reverse]);
  const described = effects.filter((effect) => effect.description);
  assert.ok(described.length >= 1500);
  assert.ok(described.every((effect) => effect.analysis.mechanicAxes.length > 0));
});

test("code-only edge cases survive text classification", () => {
  const jiuSe = data.skills.find((skill) => skill.id === 287);
  assert.ok(jiuSe.direct.tags.includes("현재부상만"));
  assert.ok(jiuSe.reverse.tags.includes("현재부상만"));
  assert.equal(jiuSe.codeVerified, true);
});

test("weapon range and trick requirements are joined to martial arts", () => {
  const daLiKaiBeiZhang = data.skills.find((skill) => skill.id === 356);
  assert.equal(daLiKaiBeiZhang.combat.recommendedWeaponName, "완철장투");
  assert.deepEqual(daLiKaiBeiZhang.combat.trickCost, [{ trickId: 6, name: "튕기기", nameCn: "崩", count: 3 }]);
  assert.equal(daLiKaiBeiZhang.combat.minDistance, 20);
  assert.equal(daLiKaiBeiZhang.combat.maxDistance, 60);
  assert.ok(daLiKaiBeiZhang.combat.compatibleWeaponGroups.length > 0);
});
