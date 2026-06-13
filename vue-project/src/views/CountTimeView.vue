<template>
  <div>
    <Header></Header>
    <section class='section'>
      <div class='container'>
        <!-- 단위(일/주/월) + 기간 선택. 원본 dayly_total_time 은 '하루 1문서'라
             일/주/월 어떤 단위로도 집계 가능. 문서ID(YYYY-MM-DD) 범위질의로
             선택 기간만 읽어 부하를 줄인다. '전체'만 2019~현재 전부 로드. -->
        <div class='field is-grouped' style='align-items:center; flex-wrap:wrap'>
          <p class='control'><span class='tag is-dark'>단위</span></p>
          <p class='control' v-for='u in units' :key='u.key'>
            <button class='button is-small'
                    :class="activeUnit === u.key ? 'is-primary' : 'is-light'"
                    :disabled='loading'
                    @click='selectUnit(u.key)'>{{ u.label }}</button>
          </p>
          <p class='control' style='margin-left:12px'><span class='tag is-dark'>기간</span></p>
          <p class='control' v-for='r in currentRanges' :key='r.label'>
            <button class='button is-small'
                    :class="activeDays === r.days ? 'is-link' : 'is-light'"
                    :disabled='loading'
                    @click='load(r.days)'>{{ r.label }}</button>
          </p>
        </div>
        <div class='field is-grouped' style='align-items:center; flex-wrap:wrap; margin-top:6px'>
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
              <th class='num' v-for='b in buckets' :key='b'>{{ b }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='row in filteredRows' :key='row.bookId'>
              <td class='sticky-col'>{{ titleMap[row.bookId] || '(미확인)' }}</td>
              <td class='muted'>{{ row.bookId }}</td>
              <td class='num total'>{{ fmt(row.count) }}</td>
              <td class='num' v-for='b in buckets' :key='b'>{{ row[b] ? fmt(row[b]) : '' }}</td>
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
      // 단위별 기간 프리셋. days = 오늘 기준 며칠 전부터(null = 전체).
      units: [
        { key: 'month', label: '월', ranges: [
          { label: '6개월', days: 182 }, { label: '12개월', days: 365 }, { label: '전체', days: null }
        ] },
        { key: 'week', label: '주', ranges: [
          { label: '8주', days: 56 }, { label: '26주', days: 182 }, { label: '52주', days: 364 }
        ] },
        { key: 'day', label: '일', ranges: [
          { label: '14일', days: 14 }, { label: '30일', days: 30 }, { label: '90일', days: 90 }
        ] }
      ],
      activeUnit: 'month',
      activeDays: 182,
      loading: false,
      filterText: '',
      titleMap: {}, // { bookId: title } — search_index/books 단일 문서에서 1회 로드
      rows: [], // 선택 기간에 '읽힌 적 있는' 책만, 합계 내림차순
      buckets: [], // 선택 단위의 구간 라벨 목록 (최신순)
      docCount: 0 // 선택 기간에 집계된 일별 문서 수
    }
  },
  computed: {
    currentRanges () {
      return this.units.find(u => u.key === this.activeUnit).ranges
    },
    rangeLabel () {
      if (this.buckets.length === 0) return '데이터 없음'
      return `${this.buckets[this.buckets.length - 1]} ~ ${this.buckets[0]}`
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
    await this.load(this.activeDays)
  },
  methods: {
    fmt (n) {
      return (n || 0).toLocaleString()
    },
    // 단위 전환 시 그 단위의 첫 프리셋으로 재조회.
    selectUnit (key) {
      if (this.activeUnit === key) return
      this.activeUnit = key
      this.load(this.units.find(u => u.key === key).ranges[0].days)
    },
    // 일별 문서ID(YYYY-MM-DD)를 현재 단위의 구간 키로 변환.
    bucketOf (id) {
      if (this.activeUnit === 'day') return id
      if (this.activeUnit === 'week') return this.$moment(id).format('GGGG-[W]WW') // ISO주 (예: 2026-W24)
      return id.slice(0, 7) // 월: YYYY-MM
    },
    async load (days) {
      this.activeDays = days
      this.loading = true
      this.rows = []
      this.buckets = []
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
        if (days) {
          const startId = this.$moment().subtract(days, 'days').format('YYYY-MM-DD')
          query = query
            .orderBy(Firebase.firestore.FieldPath.documentId())
            .startAt(startId)
        }
        const snap = await query.get()
        this.docCount = snap.size

        const byBook = {} // bookId -> { bookId, count, [bucket]: time }
        const bucketSet = {}
        snap.docs.forEach(doc => {
          const bucket = this.bucketOf(doc.id)
          bucketSet[bucket] = true
          const counts = doc.data().total_count || {}
          for (const bid in counts) {
            const t = counts[bid]
            if (!t) continue
            let row = byBook[bid]
            if (!row) { row = byBook[bid] = { bookId: bid, count: 0 } }
            row[bucket] = (row[bucket] || 0) + t
            row.count += t
          }
        })

        this.buckets = Object.keys(bucketSet).sort().reverse() // 최신 구간이 왼쪽
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
