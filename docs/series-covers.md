# 북슐랭 자체제작 교양 시리즈 — 통일 표지 규칙 (2026-06 확정)

자체제작(공유마당/PD 기반) **교양 시리즈** 표지는 두 시리즈 · 두 고정 포맷으로 통일한다.
신규 책을 시리즈에 추가할 때도 **반드시 아래 방식으로 표지를 만들어** 통일성을 유지한다.

생성기: [`scripts/build_series_cover.py`](../scripts/build_series_cover.py) (Pillow + numpy)
출력 규격: **1000×1500 JPEG q83** (2:3, 전 시리즈 공통)

## 두 포맷

| 시리즈 | format | 제목 위치 | 제목 폰트 | 특징 |
|---|---|---|---|---|
| **잠들기 전 …** | `jamdeulgi` | **상단** | Pretendard Bold (산세리프) | 풀블리드 사진 + 상단 2단 제목 + 짧은 골드 밑줄 + 한 줄 부제 + 하단 "북슐랭". **상단 "북슐랭 교양 시리즈" 배지는 넣지 않음**(2026-06 제거 결정) |
| **일상의 …** | `ilsang` | **하단** | KoPubWorld Batang (명조) | 풀블리드 사진 + 상단 "BOOKCHELIN" 워드마크 + 하단 그라데이션 위 2단 제목/부제. = 기존 `make_covers.py` VariantA |

제목 1행 = 시리즈명("잠들기 전" / "일상의"), 2행 = 큰 키워드(우주·심해·과학…).

## 사진 소스 규칙 (중요)

표지는 공개 노출되므로 **반드시 저작권 안전한 CC0 / 퍼블릭도메인**만 사용한다.
- 일반: **Openverse API** `https://api.openverse.org/v1/images/?q=…&license=cc0,pdm`
- 우주(성운) 등: NASA/ESA 허블 같은 퍼블릭도메인 가능 (예: 창조의 기둥 = Eagle Nebula, Hubble)
- 받은 원본은 `scripts/series_photos/<키워드>.jpg` 에 저장(생성기 기본 입력 경로).

## 신규 책 추가 절차

1. CC0/PD 사진을 `scripts/series_photos/<키워드>.jpg` 로 저장
2. `build_series_cover.py` 의 `BOOKS` 에 한 줄 추가
   `{"topic": "<키워드>", "series": "잠들기 전|일상의", "fmt": "jamdeulgi|ilsang", "subtitle": "…", "anchor": "top|center|bottom", "tint": (r,g,b)}`
3. `python3 scripts/build_series_cover.py` → `scripts/series_out/<키워드>.jpg` 확인
4. Storage 업로드 + `books/<id>.image_url` 교체 (admin SDK 키 사용):
   - 경로: `cover/북슐랭_<파일키>_series.jpg`, metadata `cacheControl: public, max-age=2592000`,
     `firebaseStorageDownloadTokens`(uuid) 설정 → 다운로드 URL 구성
   - **새 파일명**으로 올려야 URL이 바뀌어 앱/CDN 캐시 충돌이 없다.

## 현재 적용본 (2026-06)

잠들기 전(상단/Pretendard): 우주(창조의 기둥·Hubble PD)·심해(빛내림 수중)·극지(오로라)·숲(안개 숲)
일상의(하단/KoPub 명조): 과학(물방울 매크로)·심리학(석양)·경제(황혼 도시)·몸(석양 실루엣)
모두 CC0/PD 사진. 이전 표지 URL은 작업 로그에 롤백용으로 보관.
