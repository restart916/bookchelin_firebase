<template>
  <div>
    <Header></Header>
    <section class='section'>
      <div class='container'>
        <!-- 기간 선택: 기본 최근 6개월. dayly_total_time 문서ID(YYYY-MM-DD) 범위질의로
             선택 기간만 읽어 부하를 줄인다. '전체'만 2019~현재 전부 로드(느릴 수 있음). -->
        <div class='field is-grouped' style='align-items:center; flex-wrap:wrap'>
          <p class='control' v-for='opt in periodOptions' :key='opt.label'>
            <button class='button is-small'
                    :class="activeMonths === opt.months ? 'is-link' : 'is-light'"
                    :disabled='loading'
                    @click='load(opt.months)'>{{ opt.label }}</button>
          </p>
          <p class='control'>
            <input class='input is-small' style='width:240px'
                   v-model='filterText' placeholder='책 제목·ID 검색'>
          </p>
          <p class='control'>
            <span v-if='loading' class='tag is-warning'>불러오는 중…</span>
            <span v-else class='tag is-light'>
              {{ rangeLabel }} · 책 {{ filteredRows.length }}권 · 읽힌 {{ docCount }}일
            </span>
          </p>
        </div>
      </div>
    </section>

    <section class='section' style='padding-top:0'>
      <div class='container' style='overflow-x:auto'>
        <table>
          <thead>
            <tr>
              <th class='sticky-col'>책 제목</th>
              <th>bookId</th>
              <th class='num'>합계</th>
              <th class='num' v-for='m in dateList' :key='m'>{{ m }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='row in filteredRows' :key='row.bookId'>
              <td class='sticky-col'>{{ titleMap[row.bookId] || '(미확인)' }}</td>
              <td class='muted'>{{ row.bookId }}</td>
              <td class='num total'>{{ fmt(row.count) }}</td>
              <td class='num' v-for='m in dateList' :key='m'>{{ row[m] ? fmt(row[m]) : '' }}</td>
            </tr>
            <tr v-if='!loading && filteredRows.length === 0'>
              <td colspan='3'>데이터 없음</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script>
import Firebase from 'firebase'
import { firestore } from '../main'
import Header from './components/Header'

export default {
  name: 'CountTimeView',
  components: {
    Header
  },
  data () {
    return {
      periodOptions: [
        { label: '최근 3개월', months: 3 },
        { label: '최근 6개월', months: 6 },
        { label: '최근 12개월', months: 12 },
        { label: '전체', months: null } // 2019~현재 전부 — 느릴 수 있음
      ],
      activeMonths: 6,
      loading: false,
      filterText: '',
      titleMap: {}, // { bookId: title } — search_index/books 단일 문서에서 1회 로드
      rows: [], // 선택 기간에 '읽힌 적 있는' 책만, 합계 내림차순
      dateList: [], // 선택 기간의 월 목록 (YYYY-MM, 최신순)
      docCount: 0 // 선택 기간에 집계된 일별 문서 수
    }
  },
  computed: {
    rangeLabel () {
      if (this.dateList.length === 0) return '데이터 없음'
      return `${this.dateList[this.dateList.length - 1]} ~ ${this.dateList[0]}`
    },
    filteredRows () {
      const q = this.filterText.trim().toLowerCase()
      if (!q) return this.rows
      return this.rows.filter(r => {
        const title = (this.titleMap[r.bookId] || '').toLowerCase()
        return title.includes(q) || r.bookId.toLowerCase().includes(q)
      })
    }
  },
  async mounted () {
    await this.load(this.activeMonths)
  },
  methods: {
    fmt (n) {
      return (n || 0).toLocaleString()
    },
    async load (months) {
      this.activeMonths = months
      this.loading = true
      this.rows = []
      this.dateList = []
      this.docCount = 0
      try {
        // 제목 맵: books 컬렉션(712건/≈1MB) 대신 search_index/books 1건만 읽는다.
        // search_index 에 없는(숨김/삭제된) 옛 책은 '(미확인)' + bookId 로 표기.
        if (Object.keys(this.titleMap).length === 0) {
          const siDoc = await firestore.collection('search_index').doc('books').get()
          const books = (siDoc.exists && siDoc.data().books) || []
          const map = {}
          books.forEach(b => { if (b.id) map[b.id] = b.title })
          this.titleMap = map
        }

        // 기간 범위질의: 문서ID 가 'YYYY-MM-DD' 라 사전순 = 시간순. startAt 으로 잘라 읽는다.
        let query = firestore.collection('dayly_total_time')
        if (months) {
          const startId = this.$moment()
            .subtract(months - 1, 'months')
            .startOf('month')
            .format('YYYY-MM-DD')
          query = query
            .orderBy(Firebase.firestore.FieldPath.documentId())
            .startAt(startId)
        }
        const snap = await query.get()
        this.docCount = snap.size

        const byBook = {} // bookId -> { bookId, count, [YYYY-MM]: time }
        const monthSet = {}
        snap.docs.forEach(doc => {
          const month = doc.id.slice(0, 7) // YYYY-MM
          monthSet[month] = true
          const counts = doc.data().total_count || {}
          for (const bid in counts) {
            const t = counts[bid]
            if (!t) continue
            let row = byBook[bid]
            if (!row) { row = byBook[bid] = { bookId: bid, count: 0 } }
            row[month] = (row[month] || 0) + t
            row.count += t
          }
        })

        this.dateList = Object.keys(monthSet).sort().reverse() // 최신 월이 왼쪽
        this.rows = Object.values(byBook).sort((a, b) => b.count - a.count) // 많이 읽힌 순
      } catch (e) {
        console.error('count-time 로딩 실패', e)
        alert('로딩 실패: ' + e.message)
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
table {
  border-collapse: collapse;
  font-size: 0.85em;
}
th, td {
  padding: 4px 10px;
  white-space: nowrap;
  border-bottom: 1px solid #eee;
}
thead th {
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 2;
  border-bottom: 2px solid #ddd;
}
.sticky-col {
  position: sticky;
  left: 0;
  background: #fff;
  z-index: 1;
  min-width: 200px;
}
thead .sticky-col {
  z-index: 3;
}
.num {
  text-align: right;
  min-width: 72px;
}
.total {
  font-weight: bold;
}
.muted {
  color: #999;
  font-size: 0.85em;
}
</style>
