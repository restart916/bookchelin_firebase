<template>
  <div>
    <Header></Header>
    <section class='section'>
      <div class='container'>
        <div class='field is-grouped'>
          <p class='control'>
            <input class='input' v-model='filterText' placeholder='책 제목·리뷰·작성자 검색'>
          </p>
          <p class='control'>
            <label class='checkbox'>
              <input type='checkbox' v-model='onlyVisible'> 숨김 제외하고 보기
            </label>
          </p>
          <p class='control'>
            <span class='tag is-light'>표시 {{ filteredReviews.length }} / 전체 {{ reviews.length }}</span>
          </p>
          <p class='control'>
            <span class='tag is-danger'>미처리 신고 {{ reports.length }}</span>
          </p>
        </div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
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
              <span v-if="reportCount(review)" class='tag is-danger'>신고 {{ reportCount(review) }}건</span>
              <div v-for="report in reportsFor(review)" :key="report.id" class='report-line'>
                {{ report.reason }}<span v-if="report.detail"> — {{ report.detail }}</span>
              </div>
            </div>
            <div class='actions'>
              <button class='button' @click="moderate(review, review.hide === '1' ? 'restore' : 'hide')">
                {{ review.hide === '1' ? '다시 보이기' : '숨기기' }}
              </button>
              <button v-if="reportCount(review)" class='button' @click="moderate(review, 'dismiss')">신고 종결</button>
              <button class='button is-danger' @click="moderate(review, 'ban')">작성 제한</button>
              <button class='button' @click="moderate(review, 'unban')">제한 해제</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firebaseFunctions } from '../main'
import Header from './components/Header'

export default {
  name: 'EditReviewView',
  components: {
    Header
  },
  firestore () {
    return {
      // 최신 리뷰가 위로. 도배/스팸 검토 시 최근 것부터 보는 게 편하다.
      reviews: firestore.collection('book_reviews'),
    }
  },
  data () {
    return {
      bookTitles: {},   // { book_id: title } — search_index/books 단일 문서에서 1회 로드
      filterText: '',
      onlyVisible: false,
      reports: [],
      pendingReviews: [],
    }
  },
  computed: {
    filteredReviews () {
      let list = this.reviews
      if (this.onlyVisible) list = list.filter(r => r.hide !== '1')
      const q = this.filterText.trim().toLowerCase()
      if (q) {
        list = list.filter(r => {
          const title = (this.bookTitles[r.book_id] || '').toLowerCase()
          return title.includes(q) ||
            (r.review || '').toLowerCase().includes(q) ||
            (r.user_name || '').toLowerCase().includes(q)
        })
      }
      return list
    }
  },
  mounted () {
    this.loadModerationQueue()
    // 책 제목 매핑: books 컬렉션을 통째로 읽지 않고 search_index/books(경량 카탈로그) 1건만 읽는다.
    firestore.collection('search_index').doc('books').get().then((doc) => {
      const data = doc.exists ? doc.data() : null
      const books = (data && data.books) || []
      const map = {}
      books.forEach((b) => { if (b.id) map[b.id] = b.title })
      this.bookTitles = map
    }).catch((e) => console.error('search_index 로드 실패', e))
  },
  methods: {
    async loadModerationQueue () {
      try {
        const result = await firebaseFunctions.httpsCallable('adminListReviewReports')({})
        this.reports = result.data.reports || []
        this.pendingReviews = result.data.pending || []
      } catch (error) {
        console.error('신고 목록 로드 실패', error)
        alert('신고 목록을 불러오지 못했습니다: ' + error.message)
      }
    },
    reportsFor (review) {
      const key = review['.key']
      return this.reports.filter(report => report.review_id === key)
    },
    reportCount (review) {
      return this.reportsFor(review).length || Number(review.report_count) || 0
    },
    async moderate (review, action) {
      try {
        await firebaseFunctions.httpsCallable('adminModerateReview')({
          review_id: review['.key'],
          action: action
        })
        await this.loadModerationQueue()
      } catch (error) {
        console.error('리뷰 운영 처리 실패', error)
        alert('처리 실패: ' + error.message)
      }
    }
  }
}
</script>

<style scoped>
.notification.card { display: flex; justify-content: space-between; align-items: center; }
.notification.card h1 { font-size: 1.1em; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.report-line { margin-top: 4px; color: #b00020; font-size: 0.85em; }
</style>
