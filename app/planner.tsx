"use client";

import {
  BookOpenText,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  GitCompareArrows,
  Hammer,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import rawData from "./data/combat-skills.json";

type Mode = "direct" | "reverse";
type Analysis = {
  concepts: string[];
  triggers: string[];
  produces: string[];
  consumes: string[];
  clears: string[];
  amplifies: string[];
  reduces: string[];
  prevents: string[];
  requires: string[];
  mechanicAxes: string[];
  mechanicLabels: string[];
  codeEvents: string[];
  codeSignals: string[];
  affectedFields: string[];
  affectedFieldIds: number[];
};
type Effect = { effectId: number; name: string; short: string[]; description: string; tags: string[]; analysis: Analysis };
type Skill = {
  id: number;
  name: string;
  nameCn: string;
  lore: string;
  grade: number;
  equipType: number;
  equipName: string;
  typeName: string;
  gridCost: number;
  sectName: string;
  sectNameCn: string;
  elementName: string;
  direct: Effect;
  reverse: Effect;
  tags: string[];
  codeClass: string | null;
  codeVerified: boolean;
  combat: {
    distanceAddition: number;
    trickCost: { trickId: number; name: string; nameCn: string; count: number }[];
    recommendedWeaponId: number;
    recommendedWeaponName: string | null;
    recommendedWeaponNameCn: string | null;
    fixedWeaponId: number;
    fixedWeaponName: string | null;
    fixedWeaponNameCn: string | null;
    weaponGroupId: number;
    weaponCandidates: number[];
    compatibleWeaponGroups: { groupId: number; representativeId: number; name: string; minDistance: number; maxDistance: number; tricks: string[] }[];
    minDistance: number | null;
    maxDistance: number | null;
  };
};
type Equipped = { skillId: number; mode: Mode };
type Relation = { skill: Skill; mode: Mode; score: number; reason: string };

const skills = rawData.skills as Skill[];
const meta = rawData.meta;
const categoryNames = ["내공", "최파", "경공", "호체", "기규"];
const categoryGlyphs = ["內", "破", "輕", "護", "奇"];
const weightedTags: Record<string, number> = {
  자동발동: 8,
  전진: 5,
  후진: 5,
  독: 5,
  생존: 5,
  오래된부상: 7,
  현재부상만: 7,
  피해감소: 4,
  봉혈: 3,
  파열: 3,
  실신: 3,
  회복: 2,
  방어: 2,
  부상: 2,
  이동: 1,
  표식: 1,
};

function effectFor(skill: Skill, mode: Mode) {
  return skill[mode];
}

function overlap(left: string[], right: string[]) {
  return left.filter((value) => right.includes(value));
}

function synergyScore(selected: Effect, candidate: Effect) {
  const a = selected.analysis;
  const b = candidate.analysis;
  const feedsCandidate = overlap(a.produces, [...b.requires, ...b.consumes, ...b.amplifies]);
  const feedsSelected = overlap(b.produces, [...a.requires, ...a.consumes, ...a.amplifies]);
  const sharedAxes = overlap(a.mechanicAxes, b.mechanicAxes);
  const sharedConcepts = overlap(a.concepts, b.concepts);
  const sharedTriggers = overlap(a.triggers, b.triggers);
  const sharedEvents = overlap(a.codeEvents, b.codeEvents);
  const sharedFields = overlap(a.affectedFields, b.affectedFields);
  const score = (feedsCandidate.length + feedsSelected.length) * 18 + sharedAxes.length * 9 + sharedTriggers.length * 4 + sharedConcepts.length * 2 + Math.min(sharedEvents.length, 3) + sharedFields.length * 3;
  let reason = "";
  if (feedsCandidate[0]) reason = `선택 무공이 만드는 「${feedsCandidate[0]}」을 발동·증폭 자원으로 사용`;
  else if (feedsSelected[0]) reason = `「${feedsSelected[0]}」을 공급해 선택 무공의 조건을 완성`;
  else if (sharedAxes[0]) reason = `같은 특효 축을 서로 다른 발동 시점에서 중첩`;
  else if (sharedTriggers[0]) reason = `「${sharedTriggers[0]}」 타이밍을 공유해 한 행동으로 함께 발동`;
  else if (sharedFields[0]) reason = `실제 전투 필드 「${sharedFields[0]}」를 함께 변경`;
  else if (sharedConcepts[0]) reason = `「${sharedConcepts.slice(0, 2).join(" · ")}」 전투 자원을 함께 운용`;
  return { score, reason };
}

function synergyRelations(selected: Skill, mode: Mode): Relation[] {
  const selectedEffect = effectFor(selected, mode);
  const selectedAnalysis = selectedEffect.analysis;
  const selectedTags = selectedEffect.tags;
  return skills
    .filter((candidate) => candidate.id !== selected.id)
    .map((candidate) => {
      const evaluated = (["direct", "reverse"] as Mode[]).map((candidateMode) => ({ candidateMode, ...synergyScore(selectedEffect, effectFor(candidate, candidateMode)) }));
      const best = evaluated.sort((a, b) => b.score - a.score)[0];
      const candidateMode = best.candidateMode;
      const candidateTags = effectFor(candidate, candidateMode).tags;
      const candidateAnalysis = effectFor(candidate, candidateMode).analysis;
      const shared = selectedTags.filter((tag) => candidateTags.includes(tag));
      let score = best.score + shared.reduce((sum, tag) => sum + (weightedTags[tag] || 1), 0);
      let reason = best.reason || (shared.length ? `${shared.slice(0, 3).join(" · ")} 축을 함께 강화` : "");
      if (selectedAnalysis.mechanicAxes.includes(candidate.sectNameCn)) {
        score += 28;
        reason = `효과가 지정한 「${candidate.sectName}」 무공이라 위력·상한 보정을 직접 받음`;
      }
      const neededTrick = selected.combat.trickCost.find((cost) => candidateAnalysis.mechanicAxes.includes(cost.nameCn));
      if (neededTrick && (candidateAnalysis.produces.includes("식") || candidateAnalysis.concepts.includes("식"))) {
        score += 30;
        reason = `시전에 필요한 「${neededTrick.name}」 식을 추가·변환해 준비 시간을 단축`;
      }
      const suppliedTrick = candidate.combat.trickCost.find((cost) => selectedAnalysis.mechanicAxes.includes(cost.nameCn));
      if (suppliedTrick && (selectedAnalysis.produces.includes("식") || selectedAnalysis.concepts.includes("식"))) {
        score += 24;
        reason ||= `선택 무공이 만드는 「${suppliedTrick.name}」 식을 이 무공이 바로 소비`;
      }
      const selectedExtendsRange = [...selectedAnalysis.produces, ...selectedAnalysis.amplifies].includes("공격 거리");
      const candidateExtendsRange = [...candidateAnalysis.produces, ...candidateAnalysis.amplifies].includes("공격 거리");
      if (selectedExtendsRange && candidate.combat.maxDistance !== null) {
        score += 14;
        reason ||= `공격 거리 증가를 받아 무기 유효 사거리 밖까지 압박 범위를 확장`;
      }
      if (candidateExtendsRange && selected.combat.maxDistance !== null) {
        score += 16;
        reason = `선택 무공의 기본 사거리 ${(selected.combat.minDistance ?? 0) / 10}–${selected.combat.maxDistance / 10}를 늘려 거리 상성을 보정`;
      }
      const candidateWeaponNameCn = candidate.combat.fixedWeaponNameCn || candidate.combat.recommendedWeaponNameCn;
      if (candidateWeaponNameCn && selectedAnalysis.mechanicAxes.includes(candidateWeaponNameCn)) {
        score += 26;
        reason = `효과가 지정한 무기 「${candidate.combat.fixedWeaponName || candidate.combat.recommendedWeaponName}」를 사용해 직접 보정을 받음`;
      }
      const direction = selectedTags.includes("전진") ? "전진" : selectedTags.includes("후진") ? "후진" : null;
      if (selectedTags.includes("자동발동") && direction && candidate.equipType === 2 && candidateTags.includes(direction)) {
        score += 18;
        reason = `${direction} 조건을 경공으로 직접 만들어 자동발동을 안정화`;
      } else if (selectedTags.includes("독") && candidateTags.includes("독")) {
        score += 8;
        reason = "독 축적·소모·전환의 같은 전투 자원을 공유";
      } else if (selectedTags.includes("생존") && (candidateTags.includes("회복") || candidateTags.includes("피해감소"))) {
        score += 6;
        reason = "패배 임계점 도달 속도를 늦춰 생존 효과의 재발동 여유 확보";
      }
      return { skill: candidate, mode: candidateMode, score, reason };
    })
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score || a.skill.id - b.skill.id)
    .slice(0, 8);
}

function counterRelations(selected: Skill, mode: Mode): Relation[] {
  const selectedEffect = effectFor(selected, mode);
  const selectedTags = selectedEffect.tags;
  const selectedAnalysis = selectedEffect.analysis;
  return skills
    .filter((candidate) => candidate.id !== selected.id)
    .flatMap((candidate) => (["direct", "reverse"] as Mode[]).map((candidateMode) => {
      const tags = effectFor(candidate, candidateMode).tags;
      const analysis = effectFor(candidate, candidateMode).analysis;
      let score = 0;
      let reason = "";
      const shutsDownOutput = overlap([...analysis.clears, ...analysis.reduces, ...analysis.prevents], [...selectedAnalysis.produces, ...selectedAnalysis.amplifies]);
      const removesRequirement = overlap([...analysis.clears, ...analysis.consumes, ...analysis.prevents], selectedAnalysis.requires);
      const blocksTrigger = overlap(analysis.prevents, selectedAnalysis.concepts);
      const equipConcept = ["내공", "최파 무공", "경령 무공", "호체 무공", "기규 무공"][selected.equipType];
      if (shutsDownOutput[0]) {
        score += shutsDownOutput.length * 16;
        reason = `선택 무공이 만드는 「${shutsDownOutput[0]}」을 제거·감소·무효화`;
      }
      if (removesRequirement[0]) {
        score += removesRequirement.length * 18;
        reason = `핵심 발동 조건 「${removesRequirement[0]}」을 먼저 소모하거나 차단`;
      }
      if (blocksTrigger[0]) {
        score += blocksTrigger.length * 12;
        reason ||= `의존 전투 축 「${blocksTrigger[0]}」을 금지·무효화`;
      }
      if (equipConcept && analysis.prevents.includes(equipConcept)) {
        score += 24;
        reason = `선택 무공의 계통인 「${selected.equipName}」 자체를 봉금·무효화`;
      }
      if (analysis.reduces.includes("무공 위력")) {
        score += 3;
        reason ||= "무공 위력을 직접 낮춰 핵심 효과와 피해를 함께 약화";
      }
      if (selected.combat.trickCost.length && ([...analysis.consumes, ...analysis.clears, ...analysis.prevents].includes("식"))) {
        score += 22;
        reason = `필수 식을 빼앗거나 금지해 ${selected.combat.trickCost.map((cost) => `${cost.name}×${cost.count}`).join(" · ")} 시전을 지연`;
      }
      if (selected.combat.recommendedWeaponId >= 0 && analysis.prevents.includes("무기")) {
        score += 25;
        reason = `필수 무기 계통을 봉금해 식 수급과 무공 시전을 동시에 차단`;
      }
      if (selected.combat.maxDistance !== null && candidate.combat.maxDistance !== null && candidate.combat.maxDistance >= selected.combat.maxDistance + 20) {
        score += 12 + Math.min(8, Math.floor((candidate.combat.maxDistance - selected.combat.maxDistance) / 10));
        reason ||= `${candidate.combat.maxDistance / 10} 거리에서 공격해 선택 무공의 ${selected.combat.maxDistance / 10} 최대 사거리 밖을 유지`;
      }
      if (selectedTags.includes("현재부상만") && tags.includes("오래된부상")) {
        score += 30;
        reason = "회복 대상에서 제외되는 오래된 부상을 만들어 불사·정화 루프를 우회";
      }
      if (selectedTags.includes("생존") && tags.includes("오래된부상")) score += 8;
      if (selectedTags.includes("방어") && tags.includes("실신")) {
        score += 5;
        reason ||= "직접 피해가 아닌 실신 표식으로 방어 축을 우회";
      }
      if (selectedTags.includes("회복") && tags.includes("피해감소")) score += 1;
      return { skill: candidate, mode: candidateMode, score, reason };
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id - b.skill.id)
    .filter((item, index, all) => all.findIndex((other) => other.skill.id === item.skill.id) === index)
    .slice(0, 8);
}

function SkillSeal({ skill, small = false }: { skill: Skill; small?: boolean }) {
  return (
    <span className={`skill-seal element-${skill.elementName} ${small ? "small" : ""}`} aria-hidden="true">
      {skill.name.slice(0, 1)}
    </span>
  );
}

export default function Planner() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");
  const [selectedId, setSelectedId] = useState(287);
  const [mode, setMode] = useState<Mode>("direct");
  const [analysisTab, setAnalysisTab] = useState<"synergy" | "counter">("synergy");
  const [equipped, setEquipped] = useState<Equipped[]>([{ skillId: 287, mode: "direct" }]);
  const [storageReady, setStorageReady] = useState(false);
  const selected = skills.find((skill) => skill.id === selectedId) || skills[0];
  const activeEffect = effectFor(selected, mode);
  const displayFacets = [...new Set([...activeEffect.analysis.mechanicLabels, ...activeEffect.analysis.triggers, ...activeEffect.analysis.concepts, ...activeEffect.analysis.affectedFields, ...activeEffect.tags])].slice(0, 14);

  useEffect(() => {
    const task = window.setTimeout(() => {
      const saved = window.localStorage.getItem("taiwu-martial-loadout-v1");
      if (saved) {
        try { setEquipped(JSON.parse(saved)); } catch { /* keep the verified sample */ }
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem("taiwu-martial-loadout-v1", JSON.stringify(equipped));
  }, [equipped, storageReady]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return skills.filter((skill) => {
      if (category !== "all" && skill.equipType !== category) return false;
      if (!normalized) return true;
      return [skill.name, skill.nameCn, skill.sectName, skill.typeName, ...skill.tags].join(" ").toLocaleLowerCase("ko").includes(normalized);
    }).slice(0, 180);
  }, [query, category]);

  const synergies = synergyRelations(selected, mode);
  const counters = counterRelations(selected, mode);
  const relations = analysisTab === "synergy" ? synergies : counters;

  const addSelected = () => {
    if (equipped.some((entry) => entry.skillId === selected.id)) {
      setEquipped((current) => current.map((entry) => entry.skillId === selected.id ? { ...entry, mode } : entry));
      return;
    }
    const used = equipped.filter((entry) => skills.find((skill) => skill.id === entry.skillId)?.equipType === selected.equipType)
      .reduce((sum, entry) => sum + (skills.find((skill) => skill.id === entry.skillId)?.gridCost || 0), 0);
    if (used + selected.gridCost <= 9) setEquipped((current) => [...current, { skillId: selected.id, mode }]);
  };

  const selectRelation = (relation: Relation) => {
    setSelectedId(relation.skill.id);
    setMode(relation.mode);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">太</div>
        <div className="brand-copy">
          <strong>태오회권 무공진</strong>
          <span>THE SCROLL OF TAIWU · 무공 플래너</span>
        </div>
        <div className="topbar-stats">
          <span><Database size={14} /> 게임 추출 {meta.skillCount}식</span>
          <span><GitCompareArrows size={14} /> 동적 축 {meta.analysisStats.mechanicAxisCount}</span>
          <span className="verified"><ShieldCheck size={14} /> 코드 검증</span>
          <button className="icon-button" title="운공판 초기화" aria-label="운공판 초기화" onClick={() => setEquipped([])}><RotateCcw size={17} /></button>
          <button className="icon-button" title="플래너 도움말" aria-label="플래너 도움말"><CircleHelp size={18} /></button>
        </div>
      </header>

      <section className="workspace">
        <aside className="library-panel panel">
          <div className="panel-heading">
            <div><span className="eyebrow">무공고</span><h1>무공 선택</h1></div>
            <span className="count-badge">{filtered.length}</span>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 · 문파 · 효과 검색" />
            {query && <button title="검색어 지우기" aria-label="검색어 지우기" onClick={() => setQuery("")}><X size={14} /></button>}
          </label>
          <div className="category-tabs" role="tablist" aria-label="무공 종류">
            <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>전체</button>
            {categoryNames.map((name, index) => <button key={name} className={category === index ? "active" : ""} onClick={() => setCategory(index)}>{name}</button>)}
          </div>
          <div className="skill-list">
            {filtered.map((skill) => (
              <button key={skill.id} className={`skill-row ${skill.id === selected.id ? "selected" : ""}`} onClick={() => { setSelectedId(skill.id); setMode("direct"); }}>
                <SkillSeal skill={skill} small />
                <span className="skill-row-copy"><strong>{skill.name}</strong><small>{skill.sectName} · {skill.typeName}</small></span>
                <span className="grade">{skill.grade}품</span>
                <span className="grid-cost">{skill.gridCost}칸</span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </aside>

        <section className="board-panel panel">
          <div className="board-heading">
            <div><span className="eyebrow">운공 배치</span><h2>운공판</h2></div>
            <div className="legend"><i className="direct-dot" /> 정련 <i className="reverse-dot" /> 역련</div>
          </div>
          <div className="qi-disc">
            <span className="disc-ring ring-one" /><span className="disc-ring ring-two" />
            <div className="disc-center"><b>運</b><small>운공 총람</small></div>
            {["금", "목", "수", "화", "토"].map((element, index) => <span key={element} className={`element-node node-${index}`}>{element}</span>)}
          </div>

          <div className="loadout-board">
            {categoryNames.map((name, equipType) => {
              const entries = equipped.filter((entry) => skills.find((skill) => skill.id === entry.skillId)?.equipType === equipType);
              const used = entries.reduce((sum, entry) => sum + (skills.find((skill) => skill.id === entry.skillId)?.gridCost || 0), 0);
              return (
                <div className="loadout-lane" key={name}>
                  <div className="lane-label"><span>{categoryGlyphs[equipType]}</span><strong>{name}</strong><small>{used}/9</small></div>
                  <div className="lane-grid">
                    {Array.from({ length: 9 }, (_, index) => <span key={index} className="grid-cell" />)}
                    <div className="equipped-cards">
                      {entries.map((entry) => {
                        const skill = skills.find((item) => item.id === entry.skillId)!;
                        return (
                          <button key={skill.id} style={{ "--span": skill.gridCost } as React.CSSProperties} className={`equipped-card ${entry.mode}`} onClick={() => { setSelectedId(skill.id); setMode(entry.mode); }}>
                            <SkillSeal skill={skill} small />
                            <span><strong>{skill.name}</strong><small>{entry.mode === "direct" ? "정련" : "역련"} · {skill.gridCost}칸</small></span>
                            <span className="remove-skill" role="button" aria-label={`${skill.name} 제거`} onClick={(event) => { event.stopPropagation(); setEquipped((current) => current.filter((item) => item.skillId !== skill.id)); }}><Minus size={12} /></span>
                          </button>
                        );
                      })}
                      {used < 9 && <span className="empty-hint"><Plus size={14} /> {9 - used}칸</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="board-footnote"><Check size={14} /> 게임의 각 계통별 9칸 제한과 무공별 점유 칸수를 그대로 계산합니다.</div>
        </section>

        <aside className="analysis-panel panel">
          <div className="selected-header">
            <SkillSeal skill={selected} />
            <div><span>{selected.sectName} · {selected.grade}품</span><h2>{selected.name}</h2><small>{selected.nameCn} · {selected.equipName} {selected.gridCost}칸</small></div>
          </div>
          <div className="mode-switch" role="tablist" aria-label="수련 방식">
            <button className={mode === "direct" ? "active direct" : ""} onClick={() => setMode("direct")}><span>正</span> 정련</button>
            <button className={mode === "reverse" ? "active reverse" : ""} onClick={() => setMode("reverse")}><span>逆</span> 역련</button>
          </div>
          <div className="effect-card">
            <div className="effect-title"><Sparkles size={15} /><strong>{activeEffect.short[0] || activeEffect.name}</strong>{selected.codeVerified && <span><ShieldCheck size={12} /> 코드 검증</span>}</div>
            <p>{activeEffect.description || "이 수련 방식에는 별도 특수 효과 설명이 없습니다."}</p>
            <div className="tag-list">{displayFacets.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            {activeEffect.tags.includes("현재부상만") && <div className="code-note"><GitCompareArrows size={15} /><span><strong>판정 보정:</strong> 실제 코드가 현재 부상에서 오래된 부상을 뺀 뒤 제거 대상을 만듭니다.</span></div>}
          </div>
          {(selected.combat.recommendedWeaponName || selected.combat.fixedWeaponName || selected.combat.trickCost.length > 0) && (
            <div className="combat-conditions">
              <div className="condition-row"><Hammer size={14} /><span><small>{selected.combat.fixedWeaponName ? "고정 무기" : "추천 무기"}</small><strong>{selected.combat.fixedWeaponName || selected.combat.recommendedWeaponName || "제한 없음"}</strong></span>{selected.combat.compatibleWeaponGroups.length > 0 && <em title={selected.combat.compatibleWeaponGroups.slice(0, 12).map((weapon) => weapon.name).join(" · ")}>호환 {selected.combat.compatibleWeaponGroups.length}계통</em>}</div>
              {selected.combat.minDistance !== null && selected.combat.maxDistance !== null && <div className="condition-row"><Ruler size={14} /><span><small>유효 사거리</small><strong>{selected.combat.minDistance / 10} – {selected.combat.maxDistance / 10}</strong></span>{selected.combat.distanceAddition !== 0 && <em>무공 {selected.combat.distanceAddition > 0 ? "+" : ""}{selected.combat.distanceAddition / 10}</em>}</div>}
              {selected.combat.trickCost.length > 0 && <div className="condition-row"><Swords size={14} /><span><small>필요 식</small><strong>{selected.combat.trickCost.map((cost) => `${cost.name} ×${cost.count}`).join(" · ")}</strong></span></div>}
            </div>
          )}
          <button className="equip-button" onClick={addSelected}><Plus size={17} /> {equipped.some((entry) => entry.skillId === selected.id) ? "선택 수련으로 변경" : "운공판에 배치"}</button>

          <div className="relation-tabs">
            <button className={analysisTab === "synergy" ? "active" : ""} onClick={() => setAnalysisTab("synergy")}><Sparkles size={15} /> 시너지 <span>{synergies.length}</span></button>
            <button className={analysisTab === "counter" ? "active" : ""} onClick={() => setAnalysisTab("counter")}><Swords size={15} /> 카운터 <span>{counters.length}</span></button>
          </div>
          <div className="relation-list">
            {relations.length ? relations.map((relation, index) => (
              <button key={relation.skill.id} className="relation-card" onClick={() => selectRelation(relation)}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <SkillSeal skill={relation.skill} small />
                <span className="relation-copy"><strong>{relation.skill.name}<em className={relation.mode}>{relation.mode === "direct" ? "정" : "역"}</em></strong><small>{relation.reason}</small></span>
                <ChevronRight size={15} />
              </button>
            )) : <div className="empty-relations"><BookOpenText size={24} /><strong>검증 가능한 관계가 없습니다</strong><span>같은 키워드만으로 억지 추천하지 않습니다.</span></div>}
          </div>
        </aside>
      </section>
      <footer className="statusbar">
        <span>DATA SHA · {meta.sourceHash.slice(0, 12)}</span>
        <span>GameData.Shared · {new Date(meta.sharedDllModifiedAt).toLocaleDateString("ko-KR")}</span>
        <span className="status-ok"><i /> 추출 데이터 정상</span>
      </footer>
    </main>
  );
}
