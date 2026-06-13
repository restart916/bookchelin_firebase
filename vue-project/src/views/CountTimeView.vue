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
                    :class="(mode === 'preset' && activeDays === r.days) ? 'is-link' : 'is-light'"
                    :disabled='loading'
                    @click='load(r.days)'>{{ r.label }}</button>
          </p>
          <!-- 커스텀 기간: 시작/끝 날짜 직접 지정 (문서ID 범위질의 startAt/endAt) -->
          <p class='control' style='margin-left:12px'><span class='tag is-dark'>직접</span></p>
          <p class='control'>
            <input class='input is-small' type='date' v-model='customStart' :disabled='loading'>
          </p>
          <p class='control'>~</p>
          <p class='control'>
            <input class='input is-small' type='date' v-model='customEnd' :disabled='loading'>
          </p>
          <p class='control'>
            <button class='button is-small'
                    :class="mode === 'custom' ? 'is-link' : 'is-light'"
                    :disabled='loading || !customStart || !customEnd'
                    @click='loadCustom()'>조회</button>
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
              <td class='sticky-col'>
                {{ titleMap[row.bookId] || '(삭제됨)' }}
                <span v-if='hiddenSet[row.bookId]' class='tag is-warning is-small'>비공개</span>
              </td>
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
      mode: 'preset', // 'preset' | 'custom' — 버튼 강조용
      customStart: '', // 커스텀 시작일 (YYYY-MM-DD)
      customEnd: '', // 커스텀 끝일 (YYYY-MM-DD, 포함)
      loading: false,
      filterText: '',
      titleMap: {}, // { bookId: title } — search_index/books 단일 문서에서 1회 로드
      hiddenSet: {}, // { bookId: true } — 카탈로그 비공개(hidden=true) 책 (개별 보충 시 채워짐)
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
    // 단위 전환 시: 커스텀 조회 중이면 같은 커스텀 기간을 그 단위로 재집계, 아니면 첫 프리셋.
    selectUnit (key) {
      if (this.activeUnit === key) return
      this.activeUnit = key
      if (this.mode === 'custom') this.loadCustom()
      else this.load(this.units.find(u => u.key === key).ranges[0].days)
    },
    // 일별 문서ID(YYYY-MM-DD)를 현재 단위의 구간 키로 변환.
    bucketOf (id) {
      if (this.activeUnit === 'day') return id
      if (this.activeUnit === 'week') return this.$moment(id).format('GGGG-[W]WW') // ISO주 (예: 2026-W24)
      return id.slice(0, 7) // 월: YYYY-MM
    },
    // 프리셋 기간(최근 N일). days=null 이면 전체.
    load (days) {
      this.mode = 'preset'
      this.activeDays = days
      const startId = days ? this.$moment().subtract(days, 'days').format('YYYY-MM-DD') : null
      return this.runQuery(startId, null)
    },
    // 커스텀 기간(시작~끝, 끝일 포함).
    loadCustom () {
      if (!this.customStart || !this.customEnd) return
      let start = this.customStart
      let end = this.customEnd
      if (start > end) { [start, end] = [end, start] } // 거꾸로 넣어도 처리
      this.mode = 'custom'
      this.activeDays = null
      return this.runQuery(start, end)
    },
    // 실제 조회+집계. startId/endId 는 'YYYY-MM-DD'(문서ID). null 이면 그 경계 없음.
    async runQuery (startId, endId) {
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

        // 기간 범위질의: 문서ID 가 'YYYY-MM-DD' 라 사전순 = 시간순. startAt/endAt 으로 잘라 읽는다.
        let query = firestore.collection('dayly_total_time')
        if (startId || endId) {
          query = query.orderBy(Firebase.firestore.FieldPath.documentId())
          if (startId) query = query.startAt(startId)
          if (endId) query = query.endAt(endId) // endAt: 끝일 문서까지 포함
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

        // 비공개(hidden=true) 책은 search_index 에 없어 제목이 '(미확인)' 으로 뜬다(삭제 아님).
        // 화면에 뜬 미해결 제목만 개별 문서로 보충 — books 컬렉션 전체 fetch(712건) 는 여전히 회피.
        // 합계순 상위부터 최대 100건. 그래도 안 나오면 진짜 삭제된 책.
        const missing = this.rows.map(r => r.bookId).filter(id => !this.titleMap[id]).slice(0, 100)
        if (missing.length) {
          const snaps = await Promise.all(
            missing.map(id => firestore.collection('books').doc(id).get())
          )
          const merged = Object.assign({}, this.titleMap)
          const hidden = Object.assign({}, this.hiddenSet)
          snaps.forEach(s => {
            if (!s.exists) return
            if (s.data().title) merged[s.id] = s.data().title
            if (s.data().hidden === true) hidden[s.id] = true // 카탈로그 비공개 표시용
          })
          this.titleMap = merged // Vue2 반응성: 새 객체로 교체
          this.hiddenSet = hidden
        }
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
