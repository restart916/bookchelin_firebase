import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label="북슐랭 홈">
          <span className="wordmark__mark" aria-hidden="true">B</span>
          <span>북슐랭</span>
        </Link>
        <nav className="site-nav" aria-label="주요 메뉴">
          <Link href="/books">모든 책</Link>
          <a className="button button--small" href="#download">앱에서 읽기</a>
        </nav>
      </div>
    </header>
  );
}
