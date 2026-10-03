"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type GuideEffect = { name: string; description: string; condition?: string };
export type DlcProfile = {
  entries: { id: number; title: string; description: string }[];
  specialSkillIds: number[];
  carriers: (GuideEffect & { id: number; codeConstants: { name: string; value: number }[] })[];
  chickenEffects: (GuideEffect & { id: number })[];
  chickenFormations: GuideEffect[];
};

export default function DlcGuide({ data, skills, version, onClose, onSelect }: {
  data: DlcProfile;
  skills: { id: number; name: string; grade: number; elementName: string; direct: { description: string } }[];
  version: string;
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="board-overlay" role="dialog" aria-modal="true" aria-label="DLC 전투 안내">
    <section className="dlc-guide">
      <header><div><span className="eyebrow">게임 파일에서 추출 · {version}</span><h2>DLC 전투 안내</h2></div><button className="icon-button" onClick={onClose} aria-label="DLC 안내 닫기"><X size={18} /></button></header>
      <nav aria-label="DLC 안내 분류">{[["overview", "업데이트"], ["skills", "특수 공법"], ["carriers", "신룡 부리기"], ["chicken", "원계 조력·진법"]].map(([id, title]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? "active" : ""}>{title}</button>)}</nav>
      <div className="dlc-guide-body">
        <p className="dlc-notice">DLC 구입·활성화 여부는 이 사이트가 확인하지 않습니다. 공법 목록과 별도로 적용되는 탈것·조력 효과입니다. 효과 안내이며 전투 시뮬레이션이나 보유 여부 판정은 아닙니다.</p>
        {tab === "overview" && data.entries.map((entry) => <article key={entry.id}><h3>{entry.title.replace(/^·\s*/, "")}</h3><p>{entry.description}</p></article>)}
        {tab === "skills" && <><p className="dlc-notice">천제 전용 신력과 신룡 천부를 일반 습득 공법과 구분해 확인하세요. 같은 이름이어도 ID가 다르면 별도 공법입니다. 선택하면 정·역련 설명과 관계 근거로 이동합니다. 신룡의 봉금 면역 코드는 짐승 형태(AnimalConfig가 있는 경우)를 조건으로 합니다.</p>{skills.filter((skill) => data.specialSkillIds.includes(skill.id)).map((skill) => <article key={skill.id}><button className={`dlc-skill grade-${skill.grade}`} onClick={() => { onSelect(skill.id); onClose(); }}>{skill.name} · {skill.elementName} · {skill.grade}품 · ID {skill.id} →</button><p>{skill.direct.description}</p></article>)}</>}
        {tab === "carriers" && data.carriers.map((effect) => <article key={effect.id}><h3>{effect.name}</h3><p>{effect.description}</p><details><summary>실제 코드 수치</summary><ul>{effect.codeConstants.map((value) => <li key={value.name}>{value.name}: {value.value}</li>)}</ul><p>거리 코드 10 = 화면 거리 1.0. 봉금 시간 증가는 기존 지속 시간에 대한 비율입니다.</p></details></article>)}
        {tab === "chicken" && <><h3>표식별 조력 효과</h3><p className="dlc-notice">표식의 점수와 조합에 따라 수치가 바뀝니다. ‘점수별 수치’는 게임 설명의 가변 수치 자리입니다.</p>{data.chickenEffects.map((effect) => <article key={effect.id}><h3>{effect.name}</h3><p>{effect.description.replace(/\{\d+\}/g, "[점수별 수치]")}</p></article>)}<h3>동시 발동 조합·추가 효과</h3>{data.chickenFormations.map((effect) => <article key={effect.name}><h3>{effect.name}</h3><small>{effect.condition}</small><p>{effect.description}</p></article>)}</>}
      </div>
    </section>
  </div>;
}
