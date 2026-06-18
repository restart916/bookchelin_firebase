import type { Metadata } from "next";

import { PRIVACY_OFFICER } from "@/lib/privacy-policy";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "북슐랭 개인정보 처리방침과 개인정보 보호책임자 안내입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="policy container">
      <header><span className="eyebrow">POLICY</span><h1>개인정보 처리방침</h1><p>본 방침은 2019년 4월 1일부터 시행됩니다.</p></header>
      <p className="policy__lead">북슐랭은 개인정보보호법에 따라 이용자의 개인정보와 권익을 보호하고 관련 고충을 원활하게 처리할 수 있도록 다음과 같은 처리방침을 두고 있습니다.</p>
      <section><h2>1. 개인정보의 처리 목적</h2><p>이용자 식별, 서비스 제공과 문의·불만 처리, 공지 전달, 서비스 이용 기록 및 접속 빈도 분석, 통계와 맞춤형 서비스 제공 및 서비스 개선을 위해 처리합니다. 목적이 변경될 경우 사전 동의를 구합니다.</p></section>
      <section><h2>2. 개인정보처리 위탁</h2><p>북슐랭은 개인정보 처리업무를 위탁하지 않습니다. 위탁이 발생할 경우 지체 없이 본 방침을 통해 공개합니다.</p></section>
      <section><h2>3. 정보주체의 권리와 행사방법</h2><p>정보주체는 개인정보 열람, 정정, 삭제 및 처리정지를 요구할 수 있습니다. 서면, 전자우편 등으로 권리를 행사할 수 있으며 북슐랭은 지체 없이 조치합니다. 법정대리인이나 위임받은 자를 통해서도 행사할 수 있습니다.</p></section>
      <section><h2>4. 처리하는 개인정보 항목과 수집 방법</h2><ul><li>필수항목: 단말기 정보(하드웨어 모델, 운영체제 버전), 로그 정보(이용자 식별 코드, 서비스 이용 기록, 설정 내용 등)</li><li>수집 목적: 접속·이용 분석, 관심 분야 파악, 서비스 개선, 통계 및 맞춤형 서비스 제공</li><li>수집 방법: 앱 최초 실행과 네트워크 접속, 서비스 이용, 고객 문의 과정 및 별도 동의가 있는 제휴 플랫폼 이용 시</li></ul></section>
      <section><h2>5. 개인정보 자동 수집 장치</h2><p>서비스 이용내역, 로그 및 하드웨어 정보를 자동 수집할 수 있으며 광고 효과 측정과 서비스 분석에 개인 식별이 불가능한 정보를 사용합니다. Google Analytics는 익명 사용자 정보를 활용합니다.</p><div className="policy-box"><strong>광고 식별자 수집 거부</strong><br />Android: 설정 → Google → 광고<br />iOS: 설정 → 개인정보 보호 → 추적(광고)</div></section>
      <section><h2>6. 처리 및 보유기간</h2><p>법령 또는 동의받은 보유·이용기간 내에서 처리합니다. 앱 이용 정보는 원칙적으로 앱 탈퇴 시까지 보유하며, 법령 위반 조사나 채권·채무 관계가 남은 경우 해당 사유가 종료될 때까지 보유할 수 있습니다. 전자상거래 관련 기록은 법률이 정한 6개월, 3년 또는 5년 동안 보관할 수 있고 통신사실확인자료는 관련 법률이 정한 기간 동안 보관할 수 있습니다.</p></section>
      <section><h2>7. 개인정보의 파기</h2><p>처리 목적이 달성되거나 보유기간이 지나 불필요해진 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구할 수 없는 기술적 방법으로 삭제합니다.</p></section>
      <section><h2>8. 안전성 확보 조치</h2><p>개인정보 취급자의 최소화와 교육, 데이터베이스 접근 권한 관리 및 접근 통제, 개인정보가 포함된 문서와 보조저장매체의 안전한 보관 등 필요한 조치를 시행합니다.</p></section>
      <section><h2>9. 개인정보 보호책임자</h2><div className="policy-box"><strong>개인정보 보호책임자 및 열람 청구 접수</strong><br />성명: {PRIVACY_OFFICER.name}<br />전화: {PRIVACY_OFFICER.phone}<br />이메일: <a href={`mailto:${PRIVACY_OFFICER.email}`}>{PRIVACY_OFFICER.email}</a></div></section>
      <section><h2>10. 개인정보 열람 청구와 피해구제</h2><p>개인정보 침해 신고와 상담은 개인정보침해 신고센터(국번 없이 118, <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer">privacy.kisa.or.kr</a>), 개인정보 분쟁조정위원회, 대검찰청 또는 경찰청의 관련 기관에 문의할 수 있습니다.</p></section>
      <section><h2>11. 처리방침 변경</h2><p>이 방침은 시행일부터 적용되며 법령과 방침에 따른 추가·삭제·정정이 있을 경우 시행 7일 전부터 공지합니다.</p></section>
    </article>
  );
}
