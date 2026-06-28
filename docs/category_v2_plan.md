# 카테고리 데이터 주도형 전환 계획 (Option B)

> 작성: 2026-06-23 / 갱신: 2026-06-23  
> 상태: 설계 확정 대기  
> 목표: 구버전 앱을 절대 깨뜨리지 않으면서, 신버전 앱에서 카테고리 개수·아이콘을 서버 데이터로 제어

### 필수 요구사항 (추가 확정)

1. **`icon_url` 데이터화 필수**: `book_category_v2` 문서에 `icon_url` 필드(Storage 이미지 URL)를 **반드시** 포함. 신앱은 `icon_url`로 아이콘 표시, 미설정 시 fallback. 기존 `book_category`에 `icon_url`을 추가하는 것도 additive라 구앱에 무해하므로 허용 — 단, 신앱의 실제 읽기 소스는 `book_category_v2`.
2. **어드민 카테고리 관리 UI 정식 산출물**: 카테고리 추가/수정/순서변경/아이콘 업로드/숨김을 웹 어드민(`/admin/categories`)에서 할 수 있어야 함. 책 편집 화면의 카테고리(v2) 지정 포함.
3. **구앱 안전 보장**: 개수 8개 초과 문제는 `book_category_v2` 별도 소스 분리로 해결. `book_category`는 동결.

---

## 0. 전제 진단 (현황 요약)

| 항목 | 현재 상태 | 위험 임계 |
|------|----------|----------|
| Flutter 레이아웃 | `sublist(0,4)` + `sublist(4,n)` 고정 2행 | 9번째 아이템(이어보기 포함)부터 Row overflow |
| Flutter 아이콘 | `cat_00{order+1}.png` 로컬 에셋, `order` 기반 | order ≥ 8이면 파일 없음 → 에러 |
| Android 레이아웃 | `FitGridView.changeSize(2, 4)` 하드코딩 8칸 | 9개부터 INVISIBLE(잘림), 크래시 없음 |
| Android 아이콘 | `catIconList[position]` 배열 하드코딩 (8개) | position ≥ 8 → catch INVISIBLE |
| `book_category` 문서 수 | 6개 (order "1"~"6") | 7번째 추가 시 Flutter 구앱 → OK; 9번째 → 크래시 |
| `book_category` 필드 | `id`, `name`, `order` 만 존재 (icon 없음) | — |

**핵심 결론**: 구앱은 `book_category` ≤ 8개 + 로컬 에셋 의존. 이 파일·컬렉션을 건드리면 구앱이 깨진다.

---

## (a) 데이터 모델 최종안

### A-1. 기존 컬렉션 `book_category` — 동결 + icon_url 추가 허용

```
book_category/{docId}           ← 구앱이 읽는 유일한 카테고리 소스
  id: "1"~"6"                   변경 금지
  name: "지식교양" …             변경 금지 (구앱 하드코딩 매핑 없음, 변경 가능하나 일관성 위해 자제)
  order: "1"~"6"  (string)      변경 금지 — Flutter 구앱이 int.parse(order)+1 로 에셋 파일명 계산
  icon_url: string              ★ 추가 허용(additive) — 구앱은 이 필드를 읽지 않으므로 무해.
                                  어드민에서 아이콘 업로드 시 여기도 같이 저장해 일관성 유지.
```

**절대 규칙**:
- **문서를 추가하지 않는다** (6개 초과 시 Flutter 구앱 Row overflow 크래시).
- **`order` 값을 바꾸지 않는다** (Flutter 구앱 에셋 파일명 계산 깨짐).
- 이 두 규칙은 CLAUDE.md에도 명문화한다 (아래 참고).

### A-2. 신규 컬렉션 `book_category_v2` — 신앱 전용 소스

```
book_category_v2/{docId}
  id: string           필수. 기존 카테고리는 "1"~"6" 그대로 재사용.
                       새 카테고리는 "7", "8" … 또는 의미 있는 slug 가능
  name: string         필수. UI 표시 이름
  order: number        필수. 정렬 기준 (정수 타입 — 기존 book_category의 string과 다름. 주의)
  icon_url: string     ★ 필수. Storage 다운로드 URL (https://firebasestorage… 형식)
                         예) https://firebasestorage.googleapis.com/v0/b/bookchelin.appspot.com/
                             o/category-icons%2F1.png?alt=media&token=…
                         미설정 허용하지 않음 — 어드민 UI에서 업로드 필수로 강제
  description: string  옵션. 웹 SEO 설명 (Next.js constants.ts 대체 시 사용)
  hidden: boolean      옵션. 미존재 또는 false = 표시. true = 앱·웹 노출 제외
  parent_id: string    옵션. 향후 서브카테고리 계층용. 1단계에선 미사용
```

**설계 포인트**:
- 구앱은 이 컬렉션을 전혀 읽지 않음 → 개수·내용 자유롭게 변경 가능.
- `icon_url`은 Storage `category-icons/{id}.{ext}` 경로의 공개 URL. 어드민에서 업로드 시 자동 저장.
- `order`는 number 타입 강제 — 어드민 저장 코드에서 `parseInt`/`Number()` 후 Firestore에 기록.
- 기존 6개 카테고리도 여기에 동일 id로 초기 문서를 생성하고 icon_url을 연결해 신앱이 읽게 한다.

**`book_category`와 `book_category_v2`의 icon_url 동기화**:  
어드민에서 카테고리 아이콘을 업로드·변경할 때, id "1"~"6" 범위라면 `book_category` 해당 문서에도 `icon_url`을 동시 업데이트한다(양쪽 write). 이 동기화는 어드민 코드에서 처리하며, `book_category`에 `icon_url`이 생겨도 구앱에 무해하다.

### A-3. `books` 컬렉션 필드 추가

```
books/{bookId}
  category: "1"~"6"        ← 기존. 구앱용. 절대 건드리지 않음
  category_v2: string      신규. 신앱 필터용. book_category_v2.id 값
                           초기값: category와 동일 값으로 백필
```

**백필 전략** (스크립트 `scripts/backfill_category_v2.js`):
```
books 전체를 읽어 category_v2 필드가 없는 문서에
  category_v2 = category (기존 값 복사)
를 batch write. 500개씩 청크.
```

- 구앱: Firestore에서 알 수 없는 필드는 자동으로 무시 → `category_v2` 추가해도 구앱에 무영향.
- 백필 전: 신앱에서 `category_v2` 없는 책을 만나면 `category` 값으로 fallback (앱 코드에서 처리).

---

## (b) 앱별 변경 목록 (향후 단계에서 구현)

> **이번 단계에서는 건드리지 않음.** 아래는 스토어 빌드 단계의 명세.

### Flutter (`bookchelin_flutter`)

| 파일 | 현재 | 변경 내용 |
|------|------|----------|
| `lib/src/models/category.dart` | `id, name, order, reference` | `iconUrl: String?` 필드 추가. `fromSnapshot`에서 `icon_url` 읽기 |
| `lib/src/pages/splash_page.dart` | `book_category.orderBy('order')` | `book_category_v2.where('hidden', isNotEqualTo: true).orderBy('order')` 로 소스 교체. 신앱 빌드 플래그로 분기 가능 |
| `lib/src/widgets/category_view.dart` | `sublist(0,4)` + `sublist(4,n)` 고정 2행 | `Wrap(spacing:..., children: category.map(_buildListItem).toList())` 로 교체. 개수 무관 자동 줄바꿈 |
| `lib/src/widgets/category_view.dart` | `Image.asset("cat_00${order+1}")` | `iconUrl != null ? CachedNetworkImage(url) : Image.asset("cat_001")` fallback 포함 |
| `pubspec.yaml` | — | `cached_network_image` 패키지 추가 |

**구앱 안전 보장**: 구앱 바이너리는 `book_category_v2` 컬렉션을 참조하는 코드가 없음. 신앱과 구앱이 동시에 마켓에 있어도 구앱은 기존 `book_category`만 읽음.

### Android (`bookchelin_android`)

| 파일 | 현재 | 변경 내용 |
|------|------|----------|
| `NewMainActivity.java` | `db.collection("book_category")` | `db.collection("book_category_v2")` 로 교체 |
| `NewMainActivity.java` | `changeSize(2, 4)` 하드코딩 | `changeSize((int) Math.ceil(size / 4.0), 4)` 로 교체 (주석 해제) |
| `CategoryItem.java` | `firebaseUrl` 필드 (현재 null) | `iconUrl: String` 로 rename + `getData().get("icon_url")` 파싱 |
| `CategoryAdapter.java` | `catIconList[position]` 하드코딩 | `item.getIconUrl() != null ? Glide.with(ctx).load(url).into(iv) : iv.setImageResource(R.drawable.cat_fallback)` |
| `build.gradle` | — | Glide 의존성 추가 (`implementation 'com.github.bumptech.glide:glide:4.x'`) |

**구앱 안전 보장**: 동일. 구앱 APK에는 `book_category_v2` 참조 코드 없음.

---

## (c) 어드민 변경 — 정식 산출물 (Next.js, 이번 단계 구현)

### C-1. 카테고리 관리 화면 `/admin/categories` ★ 정식 산출물

**기능 목록 (전부 필수)**:

| 기능 | 상세 |
|------|------|
| **목록 조회** | `book_category_v2` 문서를 `order` 오름차순으로 나열. id·name·order·icon 미리보기·hidden 상태 표시 |
| **카테고리 추가** | 폼: `id`(필수·고유), `name`(필수), `order`(필수·number), `description`(옵션). 아이콘 이미지 파일 업로드 필수. 저장 시 Storage `category-icons/{id}.{ext}` 업로드 → `icon_url` 획득 → Firestore 쓰기. id "1"~"6"이면 `book_category` 해당 문서에도 `icon_url` 동시 업데이트 |
| **카테고리 수정** | name·description 인라인 편집. 아이콘 교체: 새 파일 업로드 → 기존 파일 덮어쓰기(파일명 유지) or 새 파일명으로 업로드 후 `icon_url` 갱신 |
| **순서 변경** | order 숫자 직접 입력 또는 ↑↓ 버튼으로 swap. 변경 즉시 Firestore 반영 |
| **숨김/노출 토글** | `hidden: true/false` 토글. 문서 삭제 없이 앱 노출 제어 |
| **삭제** | 확인 다이얼로그 후 `book_category_v2` 문서 삭제. id "1"~"6"은 삭제 버튼 비활성화(기본 카테고리 보호) |
| **구앱 안전 경고** | UI 상단에 고정 배너: "⚠️ book_category(구앱용)는 이 화면에서 관리하지 않습니다. 구앱 카테고리 수는 6개로 고정됩니다." |

**구현 방식 (Next.js)**:
- `"use client"` 페이지
- Firestore: `listDocsPaginated("book_category_v2", { field: "order", dir: "asc" })` 로 목록 로드
- 아이콘 업로드: Firebase Storage SDK (`uploadBytes`, `getDownloadURL`) — 서버 액션 또는 클라이언트 직접
- 쓰기: `admin-db.ts`의 `updateDocAt` / `setDocAt` 활용
- 아이콘 미리보기: `<img src={icon_url} width={40} height={40} />`

### C-2. 책 편집 화면 `/admin/edit` 수정 ★ 정식 산출물

**변경 내용**:
- 기존 `category` 드롭다운 **유지** (구앱 데이터 경로, 건드리지 않음)
- **`category_v2` 드롭다운 추가**: 페이지 로드 시 `book_category_v2` 목록 로드 → `<select>` 렌더링
- 새 책 등록 시: `category`와 `category_v2` 둘 다 지정. 기본값 동일.
- 기존 책 수정 시: `category_v2` 미설정이면 `category` 값 pre-fill (어드민 UX).
- 저장 시: `category`와 `category_v2` 모두 Firestore에 기록.

### C-3. Storage 경로 규칙

```
Storage 경로: category-icons/{id}.{ext}
  예) category-icons/1.png, category-icons/7.png, category-icons/science.webp

  접근 방식: 공개 읽기 (storage.rules 수정 필요, 아래 참고)
  캐시: Cache-Control: public, max-age=31536000
  아이콘 교체 방법:
    - 파일명 유지 덮어쓰기: URL 불변, 앱 캐시가 남을 수 있음
    - 파일명 변경(category-icons/1_v2.png): URL 변경 → 캐시 자동 무효화 (권장)
```

**storage.rules 추가 (현재 전체 허용 상태이므로 사실상 이미 열려 있으나, 명시적으로)**:
```
match /category-icons/{allPaths=**} {
  allow read: if true;
  allow write: if request.auth != null;  // 어드민 로그인 시 쓰기
}
```

---

## (d) 롤아웃 순서

### 단계 1: 서버 기반 구축 (구앱 무영향 — 지금 바로 가능)

1. **`book_category_v2` 컬렉션 초기화**  
   기존 6개 카테고리를 동일 id로 v2 문서 생성. `icon_url`은 임시로 Storage에 기존 `cat_00X.png`를 올려서 연결하거나 어드민 UI 완성 후 업로드.

2. **`books.category_v2` 백필**  
   `scripts/backfill_category_v2.js` 실행. 전체 books에 `category_v2 = category` 복사.  
   구앱은 이 필드를 무시. 영향 없음.

3. **Storage `category-icons/` 기본 아이콘 업로드**  
   기존 앱 에셋(`cat_001.png`~`cat_007.png`)을 각 카테고리 id에 맞춰 Storage에 업로드.

### 단계 2: 어드민 UI (구앱 무영향)

4. **Next.js `/admin/categories` 카테고리 관리 화면 구현 + 배포**  
5. **책 편집 화면에 `category_v2` 필드 추가 + 배포**  

이후 모든 신규 책은 `category_v2`까지 지정. 기존 책은 백필 값 사용.

### 단계 3: 신앱 개발 · 스토어 심사 (구앱과 병행 운영)

6. **Flutter 신버전**: Wrap 레이아웃 + CachedNetworkImage + `book_category_v2` 읽기. 빌드 & TestFlight.
7. **Android 신버전**: 동적 changeSize + Glide + `book_category_v2` 읽기. 빌드 & 내부 테스트.
8. **스토어 제출 및 단계적 롤아웃**.

### 단계 4: 운영 안정 후 정리 (선택적)

9. 구앱 비율이 충분히 낮아지면 `book_category` 컬렉션 deprecate(삭제 아님, 단지 신규 편집 중단).
10. `books.category` 필드도 장기적으로 제거 가능 (신앱이 `category_v2`만 읽는 시점).

---

## (e) 리스크 및 대응

### R1. 백필 전 신앱이 `category_v2` 없는 책을 만날 경우

**상황**: 신앱 출시 직후, 백필 미완료 또는 새 책 등록 시 `category_v2` 미설정.  
**대응**: 앱 코드에서 `category_v2 ?? category` 로 fallback. `category`는 항상 존재하므로 안전.  
**현실**: 백필 스크립트를 단계 1에서 먼저 실행하므로 신앱 출시 시점엔 이미 전 도서 백필 완료.

### R2. 아이콘 미설정(`icon_url` 빈 값) 카테고리

**상황**: 새 카테고리를 생성했지만 아이콘을 아직 업로드하지 않은 상태.  
**대응**:
- Flutter: `iconUrl == null ? Image.asset("cat_001") : CachedNetworkImage(url)` (첫 번째 에셋 fallback)
- Android: `iconUrl == null ? iv.setImageResource(R.drawable.cat_fallback) : Glide.load(url)`
- 어드민에서 카테고리 생성 시 아이콘 업로드를 필수 항목으로 강제 (UX 차원).

### R3. icon_url CDN 캐시 및 갱신

**상황**: 아이콘을 바꿨을 때 앱에 캐시된 이전 이미지가 오래 남는 경우.  
**대응**:
- Storage 파일명에 버전 접미사: `cat_knowledge_v2.png` 처럼 변경 시 파일명 교체 → URL 자체가 바뀌므로 캐시 무효화 자동.
- 또는 `?v=2` 쿼리파라미터 방식 (CachedNetworkImage는 URL 전체를 캐시키로 사용).

### R4. Flutter 구앱 `category_view.dart`가 9번째 이어보기 크래시

**상황**: 구앱 코드에서 `sublist(4, category.length)` — category가 8개 이상이면 Row overflow.  
**대응**: `book_category` 컬렉션에 7번째 문서를 절대 추가하지 않음으로써 예방. v2 컬렉션으로만 추가. 이 규칙을 CLAUDE.md에 명문화.

### R5. Android `category_v2`의 `order` 타입 — string vs number

**상황**: 기존 `book_category`는 order가 `String`(Android 코드에서 `Integer.valueOf((String)...)`로 파싱). v2에서는 `number`(Firestore Long)로 설계.  
**대응**: Android 신앱 코드에서 `(Long) categoryData.get("order")` 또는 `Long.parseLong(String.valueOf(...))` 로 파싱. 혼용되지 않도록 v2 문서 생성 시 반드시 number 타입으로 저장 (어드민 코드에서 `parseInt` 후 저장).

### R6. `books` 쿼리 성능 — `category_v2` 필드 인덱스

**상황**: 신앱이 `books.where('category_v2', '==', id).orderBy('order')` 쿼리 사용 예정.  
**대응**: `firestore.indexes.json`에 복합 인덱스 추가 필요:  
`books: hidden ASC + category_v2 ASC + order DESC`  
(기존 `hidden ASC + category ASC + order DESC`와 별개로 추가. 배포 시 `firebase deploy --only firestore:indexes`.)

---

## 이번 단계 체크리스트 (구앱 무영향 서버·어드민 기반)

### 서버/데이터 (구앱에 무영향)
- [ ] `book_category_v2` 컬렉션 초기화 — 기존 6개 카테고리 동일 id로 문서 생성 (name, order, icon_url 포함)
- [ ] Storage `category-icons/` 기본 아이콘 6개 업로드 → 각 v2 문서 `icon_url` 연결
- [ ] `book_category` 기존 6개 문서에 `icon_url` 필드 추가 (additive, 구앱 무해)
- [ ] `scripts/backfill_category_v2.js` 작성 및 실행 (`books.category_v2 = books.category` 전 도서 백필)
- [ ] `firestore.indexes.json`에 복합 인덱스 추가: `books hidden ASC + category_v2 ASC + order DESC`
- [ ] `firebase deploy --only firestore:indexes` (기존 인덱스 삭제 방지 위해 "No" 확인)

### 어드민 UI ★ 정식 산출물
- [ ] Next.js `/admin/categories` 구현: 목록·추가·수정·순서변경·아이콘 업로드·숨김·삭제
- [ ] Next.js `/admin/edit` 수정: `category_v2` 드롭다운 추가, 저장 시 양 필드 동시 기록
- [ ] Next.js 빌드 + App Hosting 배포

### CLAUDE.md 규칙 명문화
- [ ] `book_category` 컬렉션에 7번째 문서 추가 금지 규칙 추가
- [ ] `book_category` 문서의 `order` 값 변경 금지 규칙 추가

---

## 참고: 파일 위치 지도

| 위치 | 역할 |
|------|------|
| `functions/index.js` | Cloud Functions — 카테고리 관련 트리거 없음(현재), 향후 `category_v2` 정합성 검증 트리거 추가 가능 |
| `firestore.indexes.json` | 복합 인덱스 — `category_v2` 인덱스 추가 대상 |
| `firestore.rules` | `book_category_v2` 읽기 허용 확인 (현재 전체 허용) |
| `storage.rules` | `category-icons/` 경로 공개 읽기 허용 추가 필요 |
| `nextjs-web/src/lib/constants.ts` | `CATEGORY_BY_ID` 하드코딩 — v2 전환 후 이 상수도 Firestore 기반으로 전환 가능하나 그건 별도 작업 |
| `scripts/backfill_category_v2.js` | 신규 작성 예정 |
| `docs/category_v2_plan.md` | 이 문서 |
