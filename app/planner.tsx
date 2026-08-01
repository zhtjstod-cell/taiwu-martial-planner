"use client";

import {
  BookOpenText,
  Check,
  ChevronRight,
  Database,
  GitCompareArrows,
  GripVertical,
  Hammer,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  ThumbsUp,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import rawManifest from "./data/combat-skills.json";
import rawSkills0 from "./data/combat-skills-0.json";
import rawSkills1 from "./data/combat-skills-1.json";
import rawSkills2 from "./data/combat-skills-2.json";
import rawSkills3 from "./data/combat-skills-3.json";
import rawSkills4 from "./data/combat-skills-4.json";
import rawSkills5 from "./data/combat-skills-5.json";
import rawSkills6 from "./data/combat-skills-6.json";
import rawSkills7 from "./data/combat-skills-7.json";

const rawData = {
  ...rawManifest,
  skills: [...rawSkills0, ...rawSkills1, ...rawSkills2, ...rawSkills3, ...rawSkills4, ...rawSkills5, ...rawSkills6, ...rawSkills7],
};

type Mode = "direct" | "reverse";
type SemanticEdge = {
  verb: string;
  resource: string;
  target: string;
  valence: string;
  source: "code" | "tooltip";
  confidence: number;
  evidence: string;
};
type Analysis = {
  concepts: string[];
  triggers: string[];
  mechanicLabels: string[];
  affectedFields: string[];
  semanticEdges: SemanticEdge[];
  logic: {
    events: { label: string }[];
    conditions: { expression: string; resources: string[]; states: string[]; target: string }[];
    operations: { symbol: string; verb: string; resources: string[]; target: string; evidence: string }[];
    coverage: { conditionCount: number; operationCount: number };
  };
};
type Effect = { effectId: number; name: string; short: string[]; description: string; tags: string[]; analysis: Analysis };
type RawRelation = { skillId: number; mode: Mode; score: number; reason: string; basis: string; resource: string; evidence: string };
type Skill = {
  id: number;
  name: string;
  nameCn: string;
  icon: string;
  lore: string;
  grade: number;
  gradeIndex?: number;
  equipType: number;
  equipName: string;
  typeName: string;
  gridCost: number;
  masteredGridCost: number;
  specificGrids: number[];
  genericGrid: number;
  sect: number;
  sectName: string;
  element: number;
  elementName: string;
  direct: Effect;
  reverse: Effect;
  codeVerified: boolean;
  relations: Record<Mode, { synergy: RawRelation[]; counter: RawRelation[] }>;
  combat: {
    distanceAddition: number;
    trickCost: { trickId: number; name: string; nameCn: string; count: number }[];
    recommendedWeaponName: string | null;
    fixedWeaponName: string | null;
    compatibleWeaponGroups: { name: string }[];
    minDistance: number | null;
    maxDistance: number | null;
    poisons: { name: string; value: number }[];
  };
};
type Equipped = { skillId: number; mode: Mode; mastered: boolean };
type Plan = { equipped: Equipped[]; genericAllocation: number[]; maxSlots: boolean };
type Relation = RawRelation & { skill: Skill };
type StrategyEntry = { id: number; title: string; datasetVersion: string; createdAt: number; votes: number; plan: Plan };

type UiProfile = {
  maxSlotCounts: number[];
  initialSlotCounts: number[];
  totalSlotCount: number;
  slotVisualSize: { width: number; height: number };
  equipTypeLogos: number[];
  supportsGenericGridAllocation: boolean;
  supportsMultiplePlans: boolean;
};
type Dataset = {
  meta: {
    schemaVersion: number;
    datasetVersion?: string;
    gameVersion?: string;
    steamBuildId?: string;
    sourceHash: string;
    skillCount: number;
    analysisStats: { semanticEdgeCount: number };
    relationAudit: { missingEvidenceCount: number };
  };
  ui: UiProfile;
  skills: Skill[];
  assets?: { combatSkillIcons?: Record<string, string> };
  [key: string]: unknown;
};
const defaultDataset = rawData as unknown as Dataset;
const categoryNames = ["내공", "파괴", "경령", "호체", "기교"];
const cardArtNames = ["acupoints", "attack", "agile", "defense", "others"];
const logicVerbNames: Record<string, string> = { produces: "생성", consumes: "소모", clears: "제거", amplifies: "증폭", reduces: "감소", prevents: "차단", modifies: "변경", filters: "대상 제외" };
const basisNames: Record<string, string> = {
  "resource-chain": "자원 연계",
  "offense-chain": "공격 연계",
  "offense-stack": "상태 누적",
  "movement-trigger": "이동 발동",
  "trick-supply": "식 수급",
  "poison-system": "독 계통",
  "range-extension": "사거리 보정",
  "sect-rule": "문파 지정",
  "weapon-rule": "무기 지정",
  "defensive-inverse": "직접 방어",
  "buff-denial": "강화 해제",
  "requirement-denial": "조건 차단",
  "old-injury-bypass": "오래된 부상 우회",
  "range-control": "거리 통제",
};

function effectFor(skill: Skill, mode: Mode) {
  return skill[mode];
}

function effectiveCost(skill: Skill, mastered: boolean) {
  return mastered ? skill.masteredGridCost : skill.gridCost;
}

function blankPlan(): Plan {
  return { equipped: [], genericAllocation: [0, 0, 0, 0], maxSlots: false };
}

function migratePlans(value: unknown): Plan[] {
  if (!Array.isArray(value)) return [{ equipped: [{ skillId: 287, mode: "direct", mastered: false }], genericAllocation: [0, 0, 0, 0], maxSlots: false }, blankPlan(), blankPlan()];
  const migrated = value.map((item): Plan => {
    if (Array.isArray(item)) return { equipped: item.map((entry) => ({ ...entry, mastered: Boolean(entry.mastered) })), genericAllocation: [0, 0, 0, 0], maxSlots: false };
    const candidate = item as Partial<Plan>;
    return {
      equipped: Array.isArray(candidate.equipped) ? candidate.equipped.map((entry) => ({ ...entry, mastered: Boolean(entry.mastered) })) : [],
      genericAllocation: Array.isArray(candidate.genericAllocation) ? [...candidate.genericAllocation.slice(0, 4), 0, 0, 0, 0].slice(0, 4).map((count) => Math.max(0, Number(count) || 0)) : [0, 0, 0, 0],
      maxSlots: Boolean(candidate.maxSlots),
    };
  });
  while (migrated.length < 3) migrated.push(blankPlan());
  return migrated.slice(0, 3);
}

function computeLayout(plan: Plan, skills: Skill[], uiProfile: UiProfile) {
  const max = uiProfile.maxSlotCounts;
  const initial = plan.maxSlots ? [...max.slice(0, 5), 0] : uiProfile.initialSlotCounts.length === 6 ? uiProfile.initialSlotCounts : [6, 1, 1, 1, 1, 0];
  const activeSkillIds = new Set<number>();
  let usedInner = 0;
  const specific = initial.slice(0, 5);
  let genericPool = initial[5] || 0;

  for (const entry of plan.equipped) {
    const skill = skills.find((candidate) => candidate.id === entry.skillId);
    if (!skill || skill.equipType !== 0) continue;
    usedInner += effectiveCost(skill, entry.mastered);
    if (usedInner > specific[0]) continue;
    activeSkillIds.add(skill.id);
    if (entry.mastered) genericPool += skill.gridCost;
    else {
      for (let equipType = 1; equipType < 5; equipType += 1) specific[equipType] += skill.specificGrids[equipType - 1] || 0;
      genericPool += skill.genericGrid;
    }
  }
  for (let equipType = 0; equipType < 5; equipType += 1) specific[equipType] = Math.min(max[equipType] || 9, specific[equipType]);

  const allocation = [0, 0, 0, 0];
  let genericLeft = genericPool;
  for (let index = 0; index < 4; index += 1) {
    const equipType = index + 1;
    const requested = Math.max(0, plan.genericAllocation[index] || 0);
    allocation[index] = Math.min(requested, genericLeft, (max[equipType] || 9) - specific[equipType]);
    genericLeft -= allocation[index];
  }
  const capacities = specific.map((count, equipType) => equipType === 0 ? count : Math.min(max[equipType] || 9, count + allocation[equipType - 1]));
  for (let equipType = 1; equipType < 5; equipType += 1) {
    let used = 0;
    for (const entry of plan.equipped) {
      const skill = skills.find((candidate) => candidate.id === entry.skillId);
      if (!skill || skill.equipType !== equipType) continue;
      used += effectiveCost(skill, entry.mastered);
      if (used <= capacities[equipType]) activeSkillIds.add(skill.id);
    }
  }
  return { capacities, specific, allocation, genericPool, genericLeft, activeSkillIds };
}

function SkillSeal({ skill, small = false, icons }: { skill: Skill; small?: boolean; icons?: Record<string, string> }) {
  const iconIndex = Math.max(0, Math.min(89, skill.sect * 6 + skill.element));
  const icon = icons?.[skill.icon] || (skill.icon ? `/game-ui/combatskilliconlegacy/${skill.icon}.png` : "");
  return <span className={`skill-seal ${small ? "small" : ""}`} style={{ backgroundImage: `${icon ? `url(${icon}), ` : ""}url(/game-ui/combatskilltypeicon/GongFaIcon_${iconIndex}.png)` }} aria-hidden="true" />;
}

function gradeClass(skill: Skill) {
  return `grade-${Math.max(1, Math.min(9, skill.grade))}`;
}

function openDatasetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("taiwu-planner", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("datasets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCustomDataset(dataset: Dataset | null) {
  const db = await openDatasetDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("datasets", "readwrite");
    if (dataset) transaction.objectStore("datasets").put(dataset, "active");
    else transaction.objectStore("datasets").delete("active");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function loadCustomDataset() {
  const db = await openDatasetDb();
  const value = await new Promise<Dataset | null>((resolve, reject) => {
    const request = db.transaction("datasets", "readonly").objectStore("datasets").get("active");
    request.onsuccess = () => resolve((request.result as Dataset | undefined) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

function validateDataset(value: unknown): Dataset {
  const candidate = value as Partial<Dataset>;
  if (!candidate || typeof candidate !== "object" || !candidate.meta || !candidate.ui || !Array.isArray(candidate.skills)) throw new Error("태오 무공 추출 파일 형식이 아닙니다.");
  if (Number(candidate.meta.schemaVersion) < 4) throw new Error("구형 추출 파일입니다. 최신 추출기로 다시 만들어 주세요.");
  if (candidate.skills.length < 1 || candidate.skills.length > 5000) throw new Error("무공 수가 허용 범위를 벗어났습니다.");
  if (!Array.isArray(candidate.ui.maxSlotCounts) || candidate.ui.maxSlotCounts.length < 5) throw new Error("운공칸 정보가 없습니다.");
  const ids = new Set<number>();
  for (const skill of candidate.skills) {
    if (!Number.isInteger(skill?.id) || ids.has(skill.id) || typeof skill.name !== "string" || skill.name.length > 80 || !skill.direct || !skill.reverse) throw new Error("무공 항목이 손상되었거나 중복되었습니다.");
    ids.add(skill.id);
  }
  return candidate as Dataset;
}

export default function Planner() {
  const [dataset, setDataset] = useState<Dataset>(defaultDataset);
  const [customDataset, setCustomDataset] = useState(false);
  const [datasetMessage, setDatasetMessage] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [strategies, setStrategies] = useState<StrategyEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [strategyTitle, setStrategyTitle] = useState("");
  const [boardMessage, setBoardMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [selectedId, setSelectedId] = useState(287);
  const [mode, setMode] = useState<Mode>("direct");
  const [analysisTab, setAnalysisTab] = useState<"synergy" | "counter">("synergy");
  const [activePlan, setActivePlan] = useState(0);
  const [plans, setPlans] = useState<Plan[]>(migratePlans(null));
  const [storageReady, setStorageReady] = useState(false);
  const skills = dataset.skills;
  const meta = dataset.meta;
  const uiProfile = dataset.ui;
  const plan = plans[activePlan] || blankPlan();
  const equipped = plan.equipped;
  const layout = useMemo(() => computeLayout(plan, skills, uiProfile), [plan, skills, uiProfile]);
  const selected = skills.find((skill) => skill.id === selectedId) || skills[0];
  const activeEffect = effectFor(selected, mode);
  const selectedEquipped = equipped.find((entry) => entry.skillId === selected.id);
  const displayFacets = [...new Set([...activeEffect.analysis.mechanicLabels, ...activeEffect.analysis.triggers, ...activeEffect.analysis.concepts, ...activeEffect.analysis.affectedFields, ...activeEffect.tags])].slice(0, 12);
  const logicEvents = [...new Set(activeEffect.analysis.logic.events.map((event) => event.label))].slice(0, 3);
  const logicConditions = activeEffect.analysis.logic.conditions.filter((condition) => condition.resources.length || condition.states.length).slice(0, 3);
  const logicOperations = activeEffect.analysis.logic.operations.filter((operation) => operation.resources.some((resource) => resource !== "전투 상태")).slice(0, 5);

  const updatePlan = (update: (current: Plan) => Plan) => {
    setPlans((current) => current.map((item, index) => index === activePlan ? update(item) : item));
  };

  useEffect(() => {
    const task = window.setTimeout(() => {
      const saved = window.localStorage.getItem("taiwu-martial-loadout-v4");
      const legacy = window.localStorage.getItem("taiwu-martial-loadout-v3") || window.localStorage.getItem("taiwu-martial-loadout-v2") || window.localStorage.getItem("taiwu-martial-loadout-v1");
      if (saved || legacy) {
        try { setPlans(migratePlans(JSON.parse(saved || legacy!))); } catch { /* keep verified sample */ }
      }
      loadCustomDataset().then((stored) => {
        if (!stored) return;
        try {
          const valid = validateDataset(stored);
          setDataset(valid);
          setCustomDataset(true);
          setDatasetMessage(`로컬 데이터 ${valid.meta.datasetVersion || valid.meta.sourceHash.slice(0, 12)} 적용됨`);
        } catch { saveCustomDataset(null).catch(() => undefined); }
      }).catch(() => undefined);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem("taiwu-martial-loadout-v4", JSON.stringify(plans));
  }, [plans, storageReady]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return skills.filter((skill) => {
      if (category !== "all" && skill.equipType !== category) return false;
      if (!normalized) return true;
      return [skill.name, skill.sectName, skill.typeName, skill.equipName, ...skill.direct.tags, ...skill.reverse.tags].join(" ").toLocaleLowerCase("ko").includes(normalized);
    });
  }, [query, category, skills]);

  const relations = (selected.relations?.[mode]?.[analysisTab] || []).map((relation) => ({ ...relation, skill: skills.find((skill) => skill.id === relation.skillId)! })).filter((relation): relation is Relation => Boolean(relation.skill));
  const synergies = selected.relations?.[mode]?.synergy || [];
  const counters = selected.relations?.[mode]?.counter || [];

  const equipSkill = (skill: Skill, targetMode: Mode) => {
    updatePlan((current) => {
      const existing = current.equipped.find((entry) => entry.skillId === skill.id);
      if (existing) return { ...current, equipped: current.equipped.map((entry) => entry.skillId === skill.id ? { ...entry, mode: targetMode } : entry) };
      const used = current.equipped.filter((entry) => skills.find((candidate) => candidate.id === entry.skillId)?.equipType === skill.equipType)
        .reduce((sum, entry) => sum + effectiveCost(skills.find((candidate) => candidate.id === entry.skillId)!, entry.mastered), 0);
      if (used + skill.gridCost > (uiProfile.maxSlotCounts[skill.equipType] || 9)) return current;
      return { ...current, equipped: [...current.equipped, { skillId: skill.id, mode: targetMode, mastered: false }] };
    });
  };

  const toggleMastered = (skillId: number) => updatePlan((current) => ({ ...current, equipped: current.equipped.map((entry) => entry.skillId === skillId ? { ...entry, mastered: !entry.mastered } : entry) }));
  const removeSkill = (skillId: number) => updatePlan((current) => ({ ...current, equipped: current.equipped.filter((entry) => entry.skillId !== skillId) }));
  const adjustGeneric = (equipType: number, delta: number) => updatePlan((current) => {
    const next = [...layout.allocation];
    const index = equipType - 1;
    if (delta > 0 && (layout.genericLeft <= 0 || layout.capacities[equipType] >= (uiProfile.maxSlotCounts[equipType] || 9))) return current;
    if (delta < 0 && next[index] <= 0) return current;
    next[index] += delta;
    return { ...current, genericAllocation: next };
  });

  const selectRelation = (relation: Relation) => {
    setSelectedId(relation.skill.id);
    setMode(relation.mode);
  };

  const importDataset = async (file: File) => {
    setDatasetMessage("추출 파일 검증 중…");
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error("파일이 100MB 제한을 넘었습니다.");
      const parsed = JSON.parse(await file.text()) as unknown;
      const valid = validateDataset(parsed);
      await saveCustomDataset(valid);
      setDataset(valid);
      setCustomDataset(true);
      setSelectedId(valid.skills.some((skill) => skill.id === selectedId) ? selectedId : valid.skills[0].id);
      setDatasetMessage(`${valid.meta.datasetVersion || valid.meta.sourceHash.slice(0, 12)} · ${valid.skills.length}식 적용 완료`);
    } catch (error) {
      setDatasetMessage(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    }
  };

  const restoreDataset = async () => {
    await saveCustomDataset(null);
    setDataset(defaultDataset);
    setCustomDataset(false);
    setSelectedId(defaultDataset.skills.some((skill) => skill.id === selectedId) ? selectedId : defaultDataset.skills[0].id);
    setDatasetMessage("사이트 기본 데이터로 복귀했습니다.");
  };

  const loadStrategies = async () => {
    setBoardLoading(true);
    try {
      const response = await fetch("/api/strategies", { cache: "no-store" });
      const body = await response.json() as { strategies?: StrategyEntry[]; error?: string };
      if (!response.ok) throw new Error(body.error || "공략을 불러오지 못했습니다.");
      setStrategies(body.strategies || []);
      setBoardMessage("");
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "공략을 불러오지 못했습니다.");
    } finally {
      setBoardLoading(false);
    }
  };

  const openBoard = () => {
    setBoardOpen(true);
    void loadStrategies();
  };

  const publishStrategy = async () => {
    setBoardLoading(true);
    try {
      const response = await fetch("/api/strategies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: strategyTitle, datasetVersion: meta.datasetVersion || meta.sourceHash.slice(0, 12), plan }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "공략을 등록하지 못했습니다.");
      setStrategyTitle("");
      await loadStrategies();
      setBoardMessage("현재 운공 조합을 등록했습니다.");
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "공략을 등록하지 못했습니다.");
    } finally {
      setBoardLoading(false);
    }
  };

  const voteStrategy = async (id: number) => {
    try {
      const response = await fetch(`/api/strategies/${id}/vote`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "추천하지 못했습니다.");
      setStrategies((current) => current.map((entry) => entry.id === id ? { ...entry, votes: entry.votes + 1 } : entry).sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt));
      setBoardMessage("추천했습니다.");
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "추천하지 못했습니다.");
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">太</div>
        <div className="brand-copy"><strong>태오회권 무공진</strong><span>THE SCROLL OF TAIWU · 무공 플래너</span></div>
        <div className="topbar-stats">
          <span><Database size={14} /> 한국어 추출 {meta.skillCount}식</span>
          <span><GitCompareArrows size={14} /> 인과 관계식 {meta.analysisStats.semanticEdgeCount}</span>
          <span className="verified"><ShieldCheck size={14} /> 대상 검수</span>
          <input ref={uploadRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDataset(file); event.currentTarget.value = ""; }} />
          <button className="topbar-action" onClick={() => uploadRef.current?.click()}><UploadCloud size={14} /> 데이터 업로드</button>
          <button className="topbar-action" onClick={openBoard}><Users size={14} /> 공략 게시판</button>
          {customDataset && <button className="topbar-action subtle" onClick={() => void restoreDataset()}>기본 데이터</button>}
          <button className="icon-button" title="현재 운공안 초기화" aria-label="현재 운공안 초기화" onClick={() => updatePlan(() => blankPlan())}><RotateCcw size={14} /></button>
        </div>
      </header>
      {datasetMessage && <div className={`dataset-banner ${customDataset ? "custom" : ""}`}><Database size={13} /><span>{datasetMessage}</span><button onClick={() => setDatasetMessage("")} aria-label="알림 닫기"><X size={12} /></button></div>}

      <section className="workspace">
        <aside className="library-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">무공 일람</span><h1>공법 선택</h1></div><span className="count-badge">{filtered.length}/{skills.length}</span></div>
          <label className="search-box"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="한국어 공법·문파·효과 검색" />{query && <button onClick={() => setQuery("")} aria-label="검색어 지우기"><X size={13} /></button>}</label>
          <nav className="category-tabs" aria-label="공법 계통">
            <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>전체</button>
            {categoryNames.map((name, index) => <button key={name} className={category === index ? "active" : ""} onClick={() => setCategory(index)}>{name}</button>)}
          </nav>
          <div className="skill-list">
            {filtered.map((skill) => (
              <div key={skill.id} className={`skill-row ${selected.id === skill.id ? "selected" : ""}`} role="button" tabIndex={0} draggable
                onDragStart={(event) => event.dataTransfer.setData("application/x-taiwu-skill", JSON.stringify({ skillId: skill.id, mode }))}
                onClick={() => setSelectedId(skill.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(skill.id); }}>
                <GripVertical className="drag-handle" size={12} /><SkillSeal skill={skill} small icons={dataset.assets?.combatSkillIcons} />
                <span className="skill-row-copy"><strong className={gradeClass(skill)}>{skill.name}</strong><small>{skill.sectName} · {skill.typeName}</small></span>
                <span className={`grade ${gradeClass(skill)}`}>{skill.grade}품</span><span className="grid-cost">{skill.gridCost}칸</span>
                <button className="quick-add" title={`${skill.name} 배치`} aria-label={`${skill.name} 배치`} onClick={(event) => { event.stopPropagation(); equipSkill(skill, mode); }}><Plus size={13} /></button>
              </div>
            ))}
          </div>
        </aside>

        <section className="board-panel panel">
          <div className="board-heading"><div><span className="eyebrow">운공 프리셋</span><h1>운공 배치</h1></div><div className="legend"><i className="direct-dot" />정련<i className="reverse-dot" />역련</div></div>
          <div className="game-board-toolbar"><span className="toolbar-label">프리셋</span><div className="plan-tabs">{plans.map((_, index) => <button key={index} className={activePlan === index ? "active" : ""} onClick={() => setActivePlan(index)}>{index + 1}</button>)}</div><button className={`max-slot-toggle ${plan.maxSlots ? "active" : ""}`} onClick={() => updatePlan((current) => ({ ...current, maxSlots: !current.maxSlots }))}><Check size={12} /> 최대 운공칸</button><span className="generic-grid-note">{plan.maxSlots ? <b>계통별 게임 상한 적용</b> : <>만능공법칸 <b>{layout.genericLeft}/{layout.genericPool}</b></>}</span></div>
          <div className="cultivation-layout">
            <div className="practitioner-core" aria-hidden="true">
              <span className="original-yuanpan" />
              <div className="meditation-mark"><span className="head" /><span className="body" /><b>運</b><small>기맥 운행</small></div>
              <div className="core-elements">{["金", "木", "水", "火", "土"].map((element) => <i key={element}>{element}</i>)}</div>
            </div>
            <div className="loadout-board">
              {categoryNames.map((name, equipType) => {
                const entries = equipped.filter((entry) => skills.find((skill) => skill.id === entry.skillId)?.equipType === equipType);
                const used = entries.reduce((sum, entry) => sum + effectiveCost(skills.find((skill) => skill.id === entry.skillId)!, entry.mastered), 0);
                const capacity = layout.capacities[equipType];
                const maxCapacity = uiProfile.maxSlotCounts[equipType] || 9;
                const logo = uiProfile.equipTypeLogos[equipType] ?? equipType;
                return (
                  <div className={`loadout-lane lane-${equipType}`} style={{ "--capacity": maxCapacity } as React.CSSProperties} key={name} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                    event.preventDefault();
                    try { const payload = JSON.parse(event.dataTransfer.getData("application/x-taiwu-skill")); const skill = skills.find((candidate) => candidate.id === payload.skillId); if (skill?.equipType === equipType) equipSkill(skill, payload.mode || mode); } catch { /* ignore external drops */ }
                  }}>
                    <div className="lane-energy">
                      <div className="qi-orb" style={{ backgroundImage: `url(/game-ui/charactermenu_equipcombatskill/charactermenu3_22_type_${logo}.png)` }}><small>{used}/{capacity}</small></div>
                      <span><strong>{name}</strong><small>{capacity < maxCapacity ? `최대 ${maxCapacity}칸` : "최대치"}</small></span>
                      {equipType > 0 && <div className="grid-adjust"><button disabled={layout.allocation[equipType - 1] <= 0} onClick={() => adjustGeneric(equipType, -1)} aria-label={`${name} 만능칸 감소`}><Minus size={11} /></button><b>+{layout.allocation[equipType - 1]}</b><button disabled={layout.genericLeft <= 0 || capacity >= maxCapacity} onClick={() => adjustGeneric(equipType, 1)} aria-label={`${name} 만능칸 증가`}><Plus size={11} /></button></div>}
                    </div>
                    <div className="lane-grid">
                      {Array.from({ length: maxCapacity }, (_, index) => <span key={index} className={`grid-cell ${index < capacity ? "available" : "locked"} ${index >= layout.specific[equipType] && index < capacity ? "generic" : ""}`} style={{ backgroundImage: `url(/game-ui/charactermenu_equipcombatskill/charactermenu3_23_${index < capacity ? "zhanyongge_0" : "kongtiao_0"}.png)` }}><i>{index + 1}</i></span>)}
                      <div className="equipped-cards">
                        {entries.map((entry) => {
                          const skill = skills.find((item) => item.id === entry.skillId)!;
                          const cost = effectiveCost(skill, entry.mastered);
                          const active = layout.activeSkillIds.has(skill.id);
                          const art = `/game-ui/combatskillicon/sp_combatskillback_${cardArtNames[equipType]}_${skill.gradeIndex ?? Math.max(0, 9 - skill.grade)}.png`;
                          return (
                            <div key={skill.id} style={{ "--span": cost, "--card-art": `url(${art})` } as React.CSSProperties} className={`equipped-card ${entry.mode} ${active ? "" : "invalid"}`} role="button" tabIndex={0} onClick={() => { setSelectedId(skill.id); setMode(entry.mode); }}>
                              <SkillSeal skill={skill} small icons={dataset.assets?.combatSkillIcons} /><span><strong>{skill.name}</strong><small>{entry.mode === "direct" ? "정련" : "역련"} · {entry.mastered ? "정해 · " : ""}{cost}칸{active ? "" : " · 운공 실패"}</small></span>
                              <button className={`mastery-mini ${entry.mastered ? "active" : ""}`} title="정해: 점유 1칸 감소, 발휘 요구 증가" onClick={(event) => { event.stopPropagation(); toggleMastered(skill.id); }}>精</button>
                              <button className="remove-skill" aria-label={`${skill.name} 제거`} onClick={(event) => { event.stopPropagation(); removeSkill(skill.id); }}><Minus size={12} /></button>
                            </div>
                          );
                        })}
                        {used < maxCapacity && <span className="empty-hint"><Plus size={14} /> 공법을 끌어놓기</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="board-footnote"><Check size={14} /> 기본 {uiProfile.initialSlotCounts.slice(0, 5).join("·")}칸 + 내공 제공칸 + 만능칸 배분, 계통별 최대 9칸과 정해 비용을 게임 코드 그대로 계산합니다.</div>
        </section>

        <aside className="analysis-panel panel">
          <div className="analysis-summary">
            <div className="selected-header"><SkillSeal skill={selected} icons={dataset.assets?.combatSkillIcons} /><div><span>{selected.sectName} · {selected.grade}품 · {selected.typeName}</span><h2 className={gradeClass(selected)}>{selected.name}</h2><small>{selected.equipName} {selected.gridCost}칸</small></div></div>
            <div className="mode-switch" role="tablist" aria-label="수련 방식"><button className={mode === "direct" ? "active direct" : ""} onClick={() => setMode("direct")}><span>正</span> 정련</button><button className={mode === "reverse" ? "active reverse" : ""} onClick={() => setMode("reverse")}><span>逆</span> 역련</button></div>
            {selectedEquipped && <button className={`mastery-toggle ${selectedEquipped.mastered ? "active" : ""}`} onClick={() => toggleMastered(selected.id)}><b>精解 · 정해</b><span>{selectedEquipped.mastered ? `${selected.gridCost}→${selected.masteredGridCost}칸 · 발휘 요구 증가 적용 중` : "점유 1칸 감소 · 발휘 요구 대폭 증가"}</span></button>}
            <div className="effect-card">
              <div className="effect-title"><Sparkles size={15} /><strong>{activeEffect.short[0] || activeEffect.name}</strong>{selected.codeVerified && <span><ShieldCheck size={12} /> 코드 검증</span>}</div>
              <p>{activeEffect.description || "이 수련 방식에는 별도 특수 효과 설명이 없습니다."}</p>
              <div className="tag-list">{displayFacets.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              <details className="logic-summary"><summary className="logic-heading"><GitCompareArrows size={14} /><strong>대상·효과 방향 근거</strong><span>{activeEffect.analysis.logic.coverage.conditionCount}조건 · {activeEffect.analysis.logic.coverage.operationCount}동작</span></summary><div className="logic-flow">{logicEvents.map((event) => <span className="logic-event" key={event}>발동 · {event}</span>)}{logicConditions.map((condition, index) => <span className="logic-condition" key={`${condition.expression}-${index}`} title={condition.expression}>조건 · {[...condition.resources, ...condition.states].slice(0, 2).join(" · ") || condition.target}</span>)}{logicOperations.map((operation, index) => <span className={`logic-operation verb-${operation.verb}`} key={`${operation.symbol}-${index}`} title={operation.evidence}>{operation.target} · {operation.resources.filter((resource) => resource !== "전투 상태").slice(0, 2).join(" · ")} {logicVerbNames[operation.verb] || "변경"}</span>)}</div></details>
            </div>
            {(selected.combat.recommendedWeaponName || selected.combat.fixedWeaponName || selected.combat.trickCost.length > 0) && <div className="combat-conditions"><div className="condition-row"><Hammer size={14} /><span><small>{selected.combat.fixedWeaponName ? "고정 무기" : "추천 무기"}</small><strong>{selected.combat.fixedWeaponName || selected.combat.recommendedWeaponName || "제한 없음"}</strong></span></div>{selected.combat.minDistance !== null && selected.combat.maxDistance !== null && <div className="condition-row"><Ruler size={14} /><span><small>유효 사거리</small><strong>{selected.combat.minDistance / 10} – {selected.combat.maxDistance / 10}</strong></span></div>}{selected.combat.trickCost.length > 0 && <div className="condition-row"><Swords size={14} /><span><small>필요 식</small><strong>{selected.combat.trickCost.map((cost) => `${cost.name} ×${cost.count}`).join(" · ")}</strong></span></div>}</div>}
            <button className="equip-button" onClick={() => equipSkill(selected, mode)}><Plus size={17} /> {selectedEquipped ? "선택 수련으로 변경" : "운공판에 배치"}</button>
          </div>

          <div className="relation-section">
            <div className="relation-tabs"><button className={analysisTab === "synergy" ? "active" : ""} onClick={() => setAnalysisTab("synergy")}><Sparkles size={15} /> 시너지 <span>{synergies.length}</span></button><button className={analysisTab === "counter" ? "active" : ""} onClick={() => setAnalysisTab("counter")}><Swords size={15} /> 카운터 <span>{counters.length}</span></button></div>
            <div className="relation-list">
              {relations.length ? relations.map((relation, index) => <div key={`${relation.skill.id}-${relation.mode}`} className="relation-card" role="button" tabIndex={0} title={relation.evidence} onClick={() => selectRelation(relation)} onKeyDown={(event) => { if (event.key === "Enter") selectRelation(relation); }}><span className="rank">{String(index + 1).padStart(2, "0")}</span><SkillSeal skill={relation.skill} small icons={dataset.assets?.combatSkillIcons} /><span className="relation-copy"><strong>{relation.skill.name}<em className={relation.mode}>{relation.mode === "direct" ? "정" : "역"}</em><i>{basisNames[relation.basis] || relation.basis}</i></strong><small>{relation.reason}</small></span><button className="quick-add" aria-label={`${relation.skill.name} 배치`} onClick={(event) => { event.stopPropagation(); equipSkill(relation.skill, relation.mode); }}><Plus size={13} /></button><ChevronRight size={15} /></div>) : <div className="empty-relations"><BookOpenText size={24} /><strong>검증 가능한 관계가 없습니다</strong><span>같은 단어만 겹치는 결과는 표시하지 않습니다.</span></div>}
            </div>
          </div>
        </aside>
      </section>

      {boardOpen && <div className="board-overlay" role="dialog" aria-modal="true" aria-label="공략 게시판">
        <div className="strategy-board">
          <header><div><span className="eyebrow">유저 운공 조합</span><h2>공략 게시판</h2></div><button className="icon-button" onClick={() => setBoardOpen(false)} aria-label="게시판 닫기"><X size={16} /></button></header>
          <div className="strategy-publish">
            <label><span>조합 제목만 입력</span><input maxLength={32} value={strategyTitle} onChange={(event) => setStrategyTitle(event.target.value)} placeholder="예: 구색옥선법 기교진기 봉쇄 조합" /></label>
            <button disabled={boardLoading || !strategyTitle.trim() || !plan.equipped.length} onClick={() => void publishStrategy()}><UploadCloud size={14} /> 현재 프리셋 등록</button>
            <small>설명·댓글은 받지 않으며, 데이터 버전과 배치된 무공만 공개됩니다.</small>
          </div>
          {boardMessage && <div className="board-message">{boardMessage}</div>}
          <div className="strategy-list">
            {boardLoading && !strategies.length ? <div className="strategy-empty">공략을 불러오는 중…</div> : strategies.length ? strategies.map((entry, index) => {
              const missing = entry.plan.equipped.filter((equippedSkill) => !skills.some((skill) => skill.id === equippedSkill.skillId)).length;
              const names = entry.plan.equipped.map((equippedSkill) => skills.find((skill) => skill.id === equippedSkill.skillId)?.name || `ID ${equippedSkill.skillId}`).slice(0, 8);
              const versionMismatch = entry.datasetVersion !== (meta.datasetVersion || meta.sourceHash.slice(0, 12));
              return <article key={entry.id} className="strategy-card">
                <span className="strategy-rank">{index + 1}</span>
                <div className="strategy-copy"><strong>{entry.title}</strong><span>{names.join(" · ") || "빈 조합"}</span><small className={versionMismatch ? "mismatch" : ""}>{entry.datasetVersion}{versionMismatch ? ` · 다른 버전${missing ? ` · 누락 ${missing}식` : ""}` : " · 현재 버전"}</small></div>
                <button className="load-strategy" disabled={Boolean(missing)} onClick={() => { updatePlan(() => ({ ...entry.plan, maxSlots: Boolean(entry.plan.maxSlots) })); setBoardOpen(false); }}>불러오기</button>
                <button className="vote-button" onClick={() => void voteStrategy(entry.id)}><ThumbsUp size={14} /><b>{entry.votes}</b></button>
              </article>;
            }) : <div className="strategy-empty"><BookOpenText size={28} /><strong>첫 공략을 등록해 보세요</strong><span>현재 프리셋과 데이터 버전이 함께 저장됩니다.</span></div>}
          </div>
        </div>
      </div>}

      <footer className="statusbar"><span>DATA · {meta.datasetVersion || meta.sourceHash.slice(0, 12)}{customDataset ? " · 로컬 업로드" : ""}</span><span>한국어 · 원본+설치 모드 우선</span><span>오류 차단 · 적의 부상 제거는 카운터에서 제외</span><span className="status-ok"><i /> 관계 근거 누락 {meta.relationAudit.missingEvidenceCount}</span></footer>
    </main>
  );
}
