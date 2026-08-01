import assert from "node:assert/strict";
import test from "node:test";
import { createBuildFile, readBuildFile } from "../app/build-transfer.mjs";

const plan = {
  equipped: [{ skillId: 287, mode: "direct", mastered: false }, { skillId: 580, mode: "reverse", mastered: true }],
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
