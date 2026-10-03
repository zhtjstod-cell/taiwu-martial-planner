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
  // Event registration and cache invalidation are excluded from mutations.
  assert.ok(data.meta.analysisStats.codeLogicOperationCount > 5000);
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

test("current ModFix preserves all 38 code-behavior description contracts across 29 skills", () => {
  const contracts = [
    [8, "summary", ["직접 외상", "중상 피해", "50%"]],
    [1743, "description", ["현재 진기 총량과 같은 양", "후천 강기"]],
    [74, "description", ["진기가 60% 증가", "약점"]],
    [800, "summary", ["진기 소모량", "봉혈"]],
    [800, "description", ["진기 소모량이 30% 감소", "봉혈"]],
    [251, "description", ["누적 이동 거리가 1", "「파괴」 진기의 10%만큼"]],
    [977, "description", ["누적 이동 거리가 1", "「호체」 진기의 10%만큼"]],
    [981, "short", ["퇴법 강공"]],
    [269, "description", ["정묘의 배분 비율과 같은 확률"]],
    [276, "short", ["속공"]],
    [1028, "description", ["최소 공격 거리가 2 감소"]],
    [305, "summary", ["거리 1", "「파괴」 진기 2점"]],
    [1031, "summary", ["거리 1", "「호체」 진기 2점"]],
    [308, "description", ["7회", "직접 피해 합계의 40%만큼"]],
    [1034, "description", ["7회", "직접 피해 합계의 40%만큼"]],
    [142, "description", ["각력이 12% 회복"]],
    [1248, "description", ["최소 공격 거리가 3 감소"]],
    [569, "summary", ["같은 양의 중상 피해"]],
    [569, "description", ["33% 증가", "같은 양의 중상 피해"]],
    [377, "description", ["「무」 식 1개당 10%", "「무」 식 1개당 5%"]],
    [579, "summary", ["최종 시전 속도가 50% 증가"]],
    [579, "description", ["최종 시전 속도가 50% 증가"]],
    [1305, "description", ["최종 시전 속도가 50% 감소"]],
    [1434, "description", ["50% 확률", "1단계 봉혈"]],
    [1136, "summary", ["적의 어기가 절반"]],
    [1148, "description", ["40% 확률", "20%로 감소"]],
    [436, "summary", ["초식 2개", "내구도 4", "「궤」 식 2개"]],
    [1237, "description", ["약화 수치의 50%만큼"]],
    [619, "description", ["이 공법 위력의 20%만큼"]],
    [1345, "description", ["「호체」 공법 위력의 20%만큼 이 공법"]],
    [1119, "description", ["1개마다", "5% 감소"]],
    [668, "description", ["소모한 호흡의 25%만큼"]],
    [1081, "summary", ["각 진기의 20%만큼"]],
    [1557, "summary", ["직접 내상이 50% 감소", "직접 외상이 50% 증가"]],
    [1563, "description", ["병기 공격 4회"]],
    [1638, "description", ["각력·호흡·자세"]],
    [1628, "description", ["중첩 1개마다", "위력이 30% 증가"]],
    [1629, "description", ["중첩 1개마다", "위력이 40% 증가"]],
  ];
  const effects = data.skills.flatMap((skill) => [
    { skill, effect: skill.direct },
    { skill, effect: skill.reverse },
  ]);
  const byEffectId = new Map(effects.map((entry) => [entry.effect.effectId, entry]));
  const modFix = data.meta.localizationMods.find((mod) => mod.name === "TaiwuKoreanCommunityFixes");

  assert.equal(modFix?.version, "1.7.0.0");
  assert.equal(contracts.length, 38);
  for (const [effectId, field, needles] of contracts) {
    const entry = byEffectId.get(effectId);
    assert.ok(entry, `effect ${effectId} must map to a planner skill`);
    const value = field === "short" ? entry.effect.short.join(" ") : entry.effect[field];
    for (const needle of needles) assert.ok(value.includes(needle), `effect ${effectId} must include ${needle}`);
  }
  assert.equal(new Set(contracts.map(([effectId]) => byEffectId.get(effectId).skill.id)).size, 29);
});

test("이합지 direct 無-trick and reverse stun-mark relationships stay separated", () => {
  const yiHeZhi = data.skills.find((skill) => skill.id === 436);
  const directEdges = yiHeZhi.direct.analysis.semanticEdges;
  const reverseEdges = yiHeZhi.reverse.analysis.semanticEdges;

  assert.ok(yiHeZhi.direct.description.includes("「무」 식 1개당 10%"));
  assert.ok(!yiHeZhi.direct.description.includes("실신 표식"));
  assert.ok(yiHeZhi.reverse.description.includes("실신 표식 1개당"));
  assert.ok(!yiHeZhi.reverse.description.includes("「무」 식"));
  assert.ok(yiHeZhi.direct.analysis.concepts.includes("무 식"));
  assert.ok(!yiHeZhi.direct.analysis.concepts.includes("실신"));
  assert.ok(yiHeZhi.reverse.analysis.concepts.includes("실신"));
  assert.ok(!yiHeZhi.reverse.analysis.concepts.includes("무 식"));
  assert.ok(directEdges.some((edge) => edge.verb === "requires" && edge.resource === "무 식" && edge.target === "양측"));
  assert.ok(!directEdges.some((edge) => edge.verb === "produces" && edge.resource === "무 식"));
  assert.ok(reverseEdges.some((edge) => edge.verb === "requires" && edge.resource === "실신" && edge.target === "양측"));
  assert.ok(!reverseEdges.some((edge) => edge.verb === "produces" && edge.resource === "실신"));
  assert.equal(yiHeZhi.direct.analysis.banControl.creates, false);
  assert.equal(yiHeZhi.reverse.analysis.banControl.creates, false);
  assert.ok(yiHeZhi.relations.direct.synergy.some((relation) => relation.basis === "offense-chain" && relation.resource === "무 식"));
  assert.ok(!yiHeZhi.relations.direct.synergy.some((relation) => relation.resource === "실신"));
  assert.ok(yiHeZhi.relations.reverse.synergy.some((relation) => relation.basis === "offense-chain" && relation.resource === "실신"));
  assert.ok(!yiHeZhi.relations.reverse.synergy.some((relation) => relation.resource === "무 식"));
});

test("tooltip conditions do not use their resulting effect as a prerequisite", () => {
  const movement = data.skills.find((skill) => skill.id === 164);
  for (const mode of ["direct", "reverse"]) {
    assert.ok(!movement[mode].analysis.semanticEdges.some((edge) => edge.verb === "requires" && edge.resource === "실신"));
  }
  const mirror = data.skills.find((skill) => skill.id === 260);
  assert.ok(mirror.reverse.analysis.semanticEdges.some((edge) => edge.verb === "requires" && edge.resource === "실신" && edge.target === "자신"));
  assert.ok(!mirror.reverse.analysis.semanticEdges.some((edge) => edge.verb === "requires" && edge.resource === "실신" && ["적", "양측"].includes(edge.target)));
  const defense = data.skills.find((skill) => skill.id === 270);
  assert.ok(defense.reverse.analysis.semanticEdges.some((edge) => edge.verb === "requires" && edge.resource === "실신" && edge.target === "적"));
  const dragon = data.skills.find((skill) => skill.id === 950);
  assert.ok(!dragon.relations.direct.synergy.some((relation) => relation.basis === "offense-chain" && [164, 260].includes(relation.skillId)));
});

test("every recommendation has a target-aware causal proof", () => {
  const harmful = new Set(["직접 피해", "피해", "외상", "내상", "중상", "부상", "오래된 부상", "파열", "봉혈", "실신", "필사 표식", "패배 표식", "독", "독 등급", "고독", "내식 문란", "약화 상태", "봉금", "무 식", "무기 내구도"]);
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
  const harmful = new Set(["직접 피해", "피해", "외상", "내상", "중상", "부상", "오래된 부상", "파열", "봉혈", "실신", "필사 표식", "패배 표식", "독", "독 등급", "고독", "내식 문란", "약화 상태", "봉금", "무 식", "무기 내구도"]);
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

test("major update includes localized DLC support and all nine added skills with original icons", async () => {
  assert.equal(data.meta.gameVersion, "1.1.27.0");
  assert.equal(data.meta.skillCount, 955);
  assert.deepEqual(data.dlc.entries.map((entry) => entry.id), [12, 13, 14]);
  assert.equal(data.dlc.chickenEffects.length, 8);
  assert.equal(data.dlc.chickenFormations.length, 11);
  assert.equal(data.dlc.carriers.filter((entry) => entry.id >= 253).length, 5);
  for (const skill of data.skills.filter((skill) => skill.id >= 946)) {
    assert.ok(data.dlc.specialSkillIds.includes(skill.id), `${skill.id} ${skill.name} must be in the special-skill guide`);
    assert.ok(skill.direct.description);
    await readFile(new URL(`../public/game-ui/combatskilliconlegacy/${skill.icon}.png`, import.meta.url));
  }
});

test("support arts with no weapon do not inherit arbitrary non-grouped weapon ranges", () => {
  const noWeapon = data.skills.filter((skill) => skill.combat.fixedWeaponId < 0 && skill.combat.recommendedWeaponId < 0);
  assert.ok(noWeapon.length > 100);
  for (const skill of noWeapon) {
    assert.equal(skill.combat.minDistance, null);
    assert.equal(skill.combat.maxDistance, null);
    for (const mode of ["direct", "reverse"]) assert.ok(!skill.relations[mode].synergy.some((relation) => relation.basis === "range-extension"));
  }
});

test("dragon implementations expose poison and injury operations, immunity scope and correctly targeted range effects", () => {
  const poison = data.skills.find((skill) => skill.id === 951);
  assert.ok(poison.direct.analysis.logic.operations.some((operation) => operation.symbol === "AddPoison" && operation.target === "적"));
  const fire = data.skills.find((skill) => skill.id === 953);
  assert.ok(fire.direct.analysis.semanticEdges.some((edge) => edge.verb === "amplifies" && edge.target === "적" && edge.resource === "외상"));
  const wood = data.skills.find((skill) => skill.id === 952);
  assert.ok(wood.direct.analysis.semanticEdges.some((edge) => edge.resource === "공격 거리" && edge.target === "적" && edge.verb === "reduces"));
  assert.ok(wood.direct.analysis.semanticEdges.some((edge) => edge.resource === "공격 거리" && edge.target === "자신" && edge.verb === "produces"));
  for (const skill of data.skills.filter((skill) => skill.id >= 950)) for (const mode of ["direct", "reverse"]) {
    assert.equal(skill[mode].analysis.banControl.immune, true);
    assert.match(skill[mode].analysis.banControl.immunityCondition, /짐승 형태/);
    assert.ok(!skill.relations[mode].counter.some((relation) => relation.basis === "element-denial"));
  }
});

test("神-trick supplies are matched as tricks, never the substring in 자신", () => {
  for (const skill of data.skills) for (const mode of ["direct", "reverse"]) for (const relation of skill.relations[mode].synergy) {
    if (relation.basis !== "trick-supply" || relation.resource !== "신") continue;
    const candidate = data.skills.find((entry) => entry.id === relation.skillId)[relation.mode];
    assert.match([candidate.description, ...candidate.short, ...candidate.analysis.mechanicAxes, ...candidate.analysis.mechanicLabels].join(" "), /「(?:신|神)」\s*(?:식|式)|(?:^|[^가-힣A-Za-z])(?:신|神)\s+(?:식|式)/);
  }
});
