import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <strong>북슐랭</strong>
          <p>일상에 좋은 책 한 끼. 앱에서 모든 책을 무료로 읽어보세요.</p>
        </div>
        <nav aria-label="하단 메뉴">
          <Link href="/books">책 둘러보기</Link>
          <Link href="/community-guidelines">커뮤니티 가이드라인</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
        </nav>
        <small>© Bookchelin. All rights reserved.</small>
      </div>
    </footer>
  );
}
