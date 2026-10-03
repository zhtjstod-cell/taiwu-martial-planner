import assert from "node:assert/strict";
import test from "node:test";
import { createBuildFile, readBuildFile } from "../app/build-transfer.mjs";

const plan = {
  equipped: [{ skillId: 287, mode: "direct", mastered: false, legendaryBookReduced: true }, { skillId: 580, mode: "reverse", mastered: true, legendaryBookReduced: false }],
  genericAllocation: [1, 0, 2, 0],
  maxSlots: false,
};

test("current preset build files round-trip with dataset identity", () => {
  const exported = createBuildFile({ plan, datasetVersion: "1.2.3", sourceHash: "abc", exportedAt: "2026-08-01T00:00:00.000Z" });
  const imported = readBuildFile(exported, new Set([287, 580]));
  assert.deepEqual(imported.plan, plan);
  assert.equal(imported.datasetVersion, "1.2.3");
  assert.equal(imported.sourceHash, "abc");
});

test("build imports reject unknown, duplicate, and malformed martial arts", () => {
  const exported = createBuildFile({ plan, datasetVersion: "1", sourceHash: "abc" });
  assert.throws(() => readBuildFile(exported, new Set([287])), /현재 데이터에 없는 공법/);
  exported.plan.equipped[1].skillId = 287;
  assert.throws(() => readBuildFile(exported, new Set([287])), /중복 배치/);
  exported.plan.equipped[1].skillId = 580;
  exported.plan.equipped[1].mode = "invalid";
  assert.throws(() => readBuildFile(exported, new Set([287, 580])), /잘못된 공법 배치/);
});

test("legacy build files migrate and modifier conflicts are rejected", () => {
  const legacy = createBuildFile({ plan, datasetVersion: "1", sourceHash: "abc" });
  legacy.schemaVersion = 1;
  for (const entry of legacy.plan.equipped) delete entry.legendaryBookReduced;
  const imported = readBuildFile(legacy, new Set([287, 580]));
  assert.ok(imported.plan.equipped.every((entry) => entry.legendaryBookReduced === false));

  const conflicted = createBuildFile({ plan, datasetVersion: "1", sourceHash: "abc" });
  conflicted.plan.equipped[0].mastered = true;
  assert.throws(() => readBuildFile(conflicted, new Set([287, 580])), /정해와 기서 수납/);
});
