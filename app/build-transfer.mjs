export const BUILD_FILE_FORMAT = "taiwu-martial-build";
export const BUILD_FILE_SCHEMA_VERSION = 2;
const SUPPORTED_BUILD_FILE_SCHEMA_VERSIONS = new Set([1, BUILD_FILE_SCHEMA_VERSION]);
const MAX_SLOT_COUNT = 12;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clonePlan(plan) {
  return {
    equipped: plan.equipped.map((entry) => ({
      skillId: entry.skillId,
      mode: entry.mode,
      mastered: entry.mastered,
      legendaryBookReduced: Boolean(entry.legendaryBookReduced),
    })),
    genericAllocation: [...plan.genericAllocation],
    maxSlots: plan.maxSlots,
  };
}

export function createBuildFile({ plan, datasetVersion, sourceHash, exportedAt = new Date().toISOString() }) {
  return {
    format: BUILD_FILE_FORMAT,
    schemaVersion: BUILD_FILE_SCHEMA_VERSION,
    dataset: { version: datasetVersion, sourceHash },
    exportedAt,
    plan: clonePlan(plan),
  };
}

export function readBuildFile(value, validSkillIds) {
  if (!isPlainObject(value) || value.format !== BUILD_FILE_FORMAT || !SUPPORTED_BUILD_FILE_SCHEMA_VERSIONS.has(value.schemaVersion)) {
    throw new Error("태오회권 운공안 파일 형식이 아닙니다.");
  }
  if (!isPlainObject(value.dataset) || typeof value.dataset.version !== "string" || typeof value.dataset.sourceHash !== "string") {
    throw new Error("운공안의 게임 데이터 버전 정보가 없습니다.");
  }
  if (!isPlainObject(value.plan) || !Array.isArray(value.plan.equipped) || !Array.isArray(value.plan.genericAllocation)) {
    throw new Error("운공안 배치 정보가 손상되었습니다.");
  }
  if (value.plan.equipped.length > 64) throw new Error("운공안의 공법 수가 허용 범위를 넘었습니다.");

  const seen = new Set();
  const missing = [];
  const equipped = value.plan.equipped.map((entry) => {
    if (!isPlainObject(entry) || !Number.isInteger(entry.skillId) || !["direct", "reverse"].includes(entry.mode) || typeof entry.mastered !== "boolean" || (entry.legendaryBookReduced !== undefined && typeof entry.legendaryBookReduced !== "boolean")) {
      throw new Error("운공안에 잘못된 공법 배치가 있습니다.");
    }
    if (entry.mastered && entry.legendaryBookReduced) throw new Error("정해와 기서 수납은 같은 공법에 동시에 적용할 수 없습니다.");
    if (seen.has(entry.skillId)) throw new Error(`같은 공법이 중복 배치되었습니다: ${entry.skillId}`);
    seen.add(entry.skillId);
    if (!validSkillIds.has(entry.skillId)) missing.push(entry.skillId);
    return { skillId: entry.skillId, mode: entry.mode, mastered: entry.mastered, legendaryBookReduced: Boolean(entry.legendaryBookReduced) };
  });
  if (missing.length) throw new Error(`현재 데이터에 없는 공법이 있습니다: ${missing.slice(0, 8).join(", ")}`);

  if (value.plan.genericAllocation.length !== 4 || value.plan.genericAllocation.some((count) => !Number.isInteger(count) || count < 0 || count > MAX_SLOT_COUNT)) {
    throw new Error("만능공법칸 배분 정보가 올바르지 않습니다.");
  }
  if (typeof value.plan.maxSlots !== "boolean") throw new Error("최대 운공칸 설정이 올바르지 않습니다.");

  return {
    datasetVersion: value.dataset.version,
    sourceHash: value.dataset.sourceHash,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    plan: {
      equipped,
      genericAllocation: [...value.plan.genericAllocation],
      maxSlots: value.plan.maxSlots,
    },
  };
}
