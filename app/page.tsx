import type { Metadata } from "next";
import Planner from "./planner";

export const metadata: Metadata = {
  title: "태오회권 무공진",
  description: "게임 코드로 검증하는 정·역련 무공 시너지와 카운터 플래너",
};

export default function Home() {
  return <Planner />;
}
