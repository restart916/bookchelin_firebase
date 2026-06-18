import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found container">
      <span className="eyebrow">404</span>
      <h1>책장을 넘겼는데,<br />이 페이지는 비어 있어요.</h1>
      <p>주소가 바뀌었거나 비공개된 책일 수 있어요.</p>
      <Link className="button" href="/books">다른 책 둘러보기</Link>
    </div>
  );
}
