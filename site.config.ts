/**
 * 회사 정체성 단일 진실원천.
 * 6.1 실습: 헤르메스에게 이 파일을 여러분 회사로 바꿔 달라고 요청하는 것부터 시작합니다.
 * 색·글꼴은 이 파일이 아니라 DESIGN.md + src/styles/tokens.css 담당입니다 (6.5).
 */
export interface SiteConfig {
  company: { name: string; tagline: string; description: string };
  links: Record<string, string>;
  cta: { enabled: boolean; label: string; href: string };
  /** 홈 히어로 배경. video 가 있으면 영상, 없으면(null) poster 이미지로 렌더됩니다. */
  hero: { video: string | null; poster: string };
}

export const siteConfig: SiteConfig = {
  company: {
    name: "MAGMA",
    tagline: "유행은 지나가도, 기본은 남습니다",
    description:
      "과장보다 단정함을, 유행보다 오래 입을 옷을. 3040 남성을 위해 시간이 지나도 유효한 기본을 만듭니다.",
  },
  links: {
    github: "https://github.com/dandacompany",
  },
  cta: {
    // 6.3 「Bluekiwi 하네스 도구 소개 (SNS발행)」에서 구현·활성화하는 확장 슬롯
    enabled: false,
    label: "",
    href: "",
  },
  hero: {
    // 6.5 「모션그래픽 생성 — 히어로 모션」 실습 슬롯.
    // 모션그래픽을 만들어 public/hero.mp4 로 저장한 뒤, 아래 video 를 "/hero.mp4" 로만 바꾸면
    // 홈 배경이 영상으로 바뀝니다 (HeroMedia.tsx 컴포넌트는 손대지 않습니다).
    // null 로 두면 poster 이미지로 완전히 동작합니다.
    video: "/hero.mp4",
    poster: "/images/magma-hero-poster.png",
  },
};
