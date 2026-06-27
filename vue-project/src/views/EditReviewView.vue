<template>
  <div>
    <Header></Header>
    <section class='section'>
      <div class='container'>
        <div class='field is-grouped is-grouped-multiline'>
          <p class='control'>
            <input class='input' v-model='filterText' placeholder='책 제목 검색' @input='onBookFilterInput'>
          </p>
          <p class='control' style='line-height:2.25em'>
            <label class='checkbox'>
              <input type='checkbox' v-model='onlyVisible' @change='onVisibleChange'> 숨김 제외
            </label>
          </p>
          <p class='control'>
            <button
              class='button is-small'
              :class="onlyReported ? 'is-danger' : 'is-light'"
              @click='toggleReported'
            >
              미처리 신고만
              <span v-if='pendingReportCount' class='tag is-white' style='margin-left:6px;color:#b00020'>{{ pendingReportCount }}</span>
            </button>
          </p>
          <p class='control' style='line-height:2.25em'>
            <span class='tag is-light'>
              <span v-if='loading'>로딩 중…</span>
              <span v-else-if='onlyReported'>신고 리뷰 {{ filteredReviews.length }}건</span>
              <span v-else-if='bookMode'>「{{ filterText }}」 리뷰 {{ filteredReviews.length }}건</span>
              <span v-else>{{ filteredReviews.length }}건 / {{ currentPage + 1 }}페이지</span>
            </span>
          </p>
        </div>
        <p v-if='bookMode && matchingBookIds.length === 0 && filterText.trim()' style='color:#888;font-size:0.9em'>
          일치하는 책 없음 — 정확한 제목 일부를 입력하세요
        </p>
      </div>
    </section>

    <section class='section'>
      <div class='container'>
        <div v-if='loading' style='text-align:center;padding:2em;color:#888'>불러오는 중…</div>
        <template v-else>
          <div class='columns' v-for='review in filteredReviews' :key="review['.key']">
            <div class='notification card' :style="review.hide === '1' ? 'opacity:0.5' : ''">
              <div>
                <h1 style='font-weight:bold'>{{ bookTitles[review.book_id] || '(제목 미확인)' }}</h1>
                <small style='color:#999'>{{ review.book_id }}</small><br>
                ★ {{ review.rating }}<br>
                {{ review.review }}<br>
                <small style='color:#888'>{{ review.user_name }}</small><br>
                <span v-if="review.hide === '1'" class='tag is-warning'>숨김</span>
                <span v-if="review.moderation_status === 'pending'" class='tag is-info'>검토 대기</span>
                <span v-if='reportCount(review)' class='tag is-danger'>신고 {{ reportCount(review) }}건</span>
                <div v-for='report in reportsFor(review)' :key='report.id' class='report-line'>
                  {{ report.reason }}<span v-if='report.detail'> — {{ report.detail }}</span>
                </div>
              </div>
              <div class='actions'>
                <button class='button' @click="moderate(review, review.hide === '1' ? 'restore' : 'hide')">
                  {{ review.hide === '1' ? '다시 보이기' : '숨기기' }}
                </button>
                <button v-if='reportCount(review)' class='button' @click="moderate(review, 'dismiss')">신고 종결</button>
                <button class='button is-danger' @click="moderate(review, 'ban')">작성 제한</button>
                <button class='button' @click="moderate(review, 'unban')">제한 해제</button>
              </div>
            </div>
          </div>

          <div v-if='filteredReviews.length === 0 && !loading' style='text-align:center;padding:2em;color:#aaa'>
            표시할 리뷰가 없습니다
          </div>

          <!-- 페이지네이션: 일반 모드(전체 목록)에서만 표시 -->
          <div v-if='!onlyReported && !bookMode' class='pagination-bar'>
            <button class='button' :disabled='currentPage === 0' @click='prevPage'>← 이전</button>
            <span style='margin:0 16px'>{{ currentPage + 1 }} 페이지</span>
            <button class='button' :disabled='!hasMore' @click='nextPage'>다음 →</button>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firebaseFunctions } from '../main'
import Header from './components/Header'

const PAGE_SIZE = 25

export default {
  name: 'EditReviewView',
  components: { Header },
  data () {
    return {
      reviews: [],
      // cursors[n] = page n의 startAfter doc (null이면 처음부터)
      cursors: [null],
      currentPage: 0,
      hasMore: false,
      loading: false,

      filterText: '',
      onlyVisible: false,
      onlyReported: false,

      bookTitles: {},
      reports: [],
      pendingReviews: [],
    }
  },
  computed: {
    pendingReportCount () {
      return new Set(this.reports.map(r => r.review_id)).size
    },
    // filterText로 부분 매칭되는 book_id 목록 (최대 5개)
    matchingBookIds () {
      const q = this.filterText.trim().toLowerCase()
      if (!q) return []
      return Object.entries(this.bookTitles)
        .filter(([, title]) => title.toLowerCase().includes(q))
        .map(([id]) => id)
        .slice(0, 5)
    },
    // 책 검색 모드: filterText가 있고 매칭 책이 존재할 때
    bookMode () {
      return this.filterText.trim().length > 0 && this.matchingBookIds.length > 0
    },
    filteredReviews () {
      let list = this.reviews
      // 숨김 제외 — 쿼리 레벨 불가(hide 필드 부재 처리 한계), 페이지 내 클라이언트 필터
      if (this.onlyVisible) list = list.filter(r => r.hide !== '1')
      // 신고 모드에서 책 검색 조합: 클라이언트 필터로 처리
      if (this.onlyReported && this.matchingBookIds.length > 0) {
        const ids = new Set(this.matchingBookIds)
        list = list.filter(r => ids.has(r.book_id))
      }
      return list
    },
  },
  mounted () {
    this.loadModerationQueue()
    firestore.collection('search_index').doc('books').get()
      .then((doc) => {
        const books = (doc.exists && doc.data().books) || []
        const map = {}
        books.forEach((b) => { if (b.id) map[b.id] = b.title })
        this.bookTitles = map
      })
      .catch((e) => console.error('search_index 로드 실패', e))
    this.loadPage()
  },
  methods: {
    // ── 데이터 로드 ───────────────────────────────────────────

    async loadPage () {
      if (this.onlyReported) return this.loadReportedReviews()
      if (this.bookMode) return this.loadBookReviews()
      this.loading = true
      try {
        let q = firestore.collection('book_reviews')
          .orderBy('updated_at', 'desc')
          .limit(PAGE_SIZE)
        const startAfterDoc = this.cursors[this.currentPage]
        if (startAfterDoc) q = q.startAfter(startAfterDoc)
        const snap = await q.get()
        this.reviews = snap.docs.map(d => ({ '.key': d.id, ...d.data() }))
        this.hasMore = snap.docs.length === PAGE_SIZE
        if (snap.docs.length > 0) {
          this.cursors = [
            ...this.cursors.slice(0, this.currentPage + 1),
            snap.docs[snap.docs.length - 1],
          ]
        }
      } catch (e) {
        console.error('리뷰 로드 실패', e)
      } finally {
        this.loading = false
      }
    },

    // 신고 모드: open 신고의 review_id로 문서 직접 패치 (bounded, 최대 ~200 unique)
    async loadReportedReviews () {
      this.loading = true
      try {
        const ids = [...new Set(this.reports.map(r => r.review_id))]
        if (ids.length === 0) { this.reviews = []; return }
        const snaps = await Promise.all(
          ids.map(id => firestore.collection('book_reviews').doc(id).get())
        )
        this.reviews = snaps
          .filter(s => s.exists)
          .map(s => ({ '.key': s.id, ...s.data() }))
      } catch (e) {
        console.error('신고 리뷰 로드 실패', e)
      } finally {
        this.loading = false
      }
    },

    // 책 검색 모드: 매칭 book_id별로 쿼리, 병렬 실행 (최대 5권 × 50리뷰)
    async loadBookReviews () {
      this.loading = true
      try {
        const chunks = await Promise.all(
          this.matchingBookIds.map(id =>
            firestore.collection('book_reviews')
              .where('book_id', '==', id)
              .limit(50)
              .get()
              .then(s => s.docs.map(d => ({ '.key': d.id, ...d.data() })))
          )
        )
        this.reviews = chunks.flat()
      } catch (e) {
        console.error('책 리뷰 로드 실패', e)
      } finally {
        this.loading = false
      }
    },

    // ── 필터 변경 핸들러 ───────────────────────────────────────

    onBookFilterInput () {
      // 신고 모드에서는 로컬 필터로만 처리 (서버 재조회 불필요)
      if (this.onlyReported) return
      clearTimeout(this._bookFilterTimer)
      this._bookFilterTimer = setTimeout(() => {
        this.resetPagination()
        this.loadPage()
      }, 300)
    },

    onVisibleChange () {
      // 숨김 제외는 클라이언트 필터만 — 재조회 불필요
    },

    toggleReported () {
      this.onlyReported = !this.onlyReported
      this.resetPagination()
      this.loadPage()
    },

    resetPagination () {
      this.currentPage = 0
      this.cursors = [null]
      this.hasMore = false
    },

    // ── 페이지 이동 ───────────────────────────────────────────

    nextPage () {
      this.currentPage += 1
      this.loadPage()
    },

    prevPage () {
      if (this.currentPage > 0) {
        this.currentPage -= 1
        this.loadPage()
      }
    },

    // ── 신고/모더레이션 유틸 ──────────────────────────────────

    async loadModerationQueue () {
      try {
        const result = await firebaseFunctions.httpsCallable('adminListReviewReports')({})
        this.reports = result.data.reports || []
        this.pendingReviews = result.data.pending || []
        if (this.onlyReported) await this.loadReportedReviews()
      } catch (error) {
        console.error('신고 목록 로드 실패', error)
        alert('신고 목록을 불러오지 못했습니다: ' + error.message)
      }
    },

    reportsFor (review) {
      return this.reports.filter(r => r.review_id === review['.key'])
    },

    reportCount (review) {
      return this.reportsFor(review).length || Number(review.report_count) || 0
    },

    async moderate (review, action) {
      try {
        await firebaseFunctions.httpsCallable('adminModerateReview')({
          review_id: review['.key'],
          action,
        })
        await this.loadModerationQueue()
        await this.loadPage()
      } catch (error) {
        console.error('리뷰 운영 처리 실패', error)
        alert('처리 실패: ' + error.message)
      }
    },
  },
}
</script>

<style scoped>
.notification.card { display: flex; justify-content: space-between; align-items: center; }
.notification.card h1 { font-size: 1.1em; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.report-line { margin-top: 4px; color: #b00020; font-size: 0.85em; }
.pagination-bar { display: flex; align-items: center; justify-content: center; padding: 1.5em 0; }
</style>
