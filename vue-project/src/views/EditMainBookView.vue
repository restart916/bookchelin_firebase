<template>
  <div>
    <Header></Header>

    <section class="section intro">
      <h1>홈 상단 관리</h1>
      <p>수동 핀은 매일 자동 선정되는 5권에 추가됩니다. 위치는 최종 캐러셀 기준이며 1부터 시작합니다.</p>
      <p class="status" :class="{ waiting: refreshStatus.indexOf('대기') >= 0 }">
        {{ refreshStatus }}
      </p>
    </section>

    <section class="section form-panel">
      <h2>{{ editingId ? '핀 수정' : '새 핀 추가' }}</h2>

      <div class="field">
        <label>책 검색</label>
        <input class="input" v-model="bookSearch" placeholder="책 제목을 입력하세요">
      </div>

      <div class="field">
        <label>책 선택</label>
        <select class="input" v-model="selectedBookId">
          <option value="" disabled>노출할 책을 선택하세요</option>
          <option v-for="book in filteredBooks" :key="book['.key']" :value="book['.key']">
            {{ book.title }} ({{ book['.key'] }})
          </option>
        </select>
      </div>

      <div class="row">
        <div class="field compact">
          <label>최종 위치</label>
          <input class="input" type="number" min="1" :max="maxPosition" v-model.number="position">
          <small>현재 입력 가능 범위: 1~{{ maxPosition }}</small>
        </div>
        <div class="field compact">
          <label>시작일 (선택)</label>
          <input class="input" type="date" v-model="startDate">
        </div>
        <div class="field compact">
          <label>종료일 (선택·포함)</label>
          <input class="input" type="date" v-model="endDate">
        </div>
        <div class="field compact checkbox-field">
          <label><input type="checkbox" v-model="isActive"> 활성</label>
        </div>
      </div>

      <div class="actions">
        <button class="button primary" :disabled="saving" @click="savePin">
          {{ saving ? '저장 중…' : (editingId ? '수정 저장' : '핀 추가') }}
        </button>
        <button v-if="editingId" class="button" :disabled="saving" @click="clearForm">취소</button>
      </div>
    </section>

    <section class="section">
      <h2>수동 핀</h2>
      <table class="pin-table">
        <thead>
          <tr>
            <th>위치</th>
            <th>책</th>
            <th>노출 기간</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(pin, index) in sortedPins" :key="pin['.key']">
            <td class="position">{{ pin.position }}</td>
            <td>
              <div class="book-cell">
                <img v-if="bookFor(pin.book_id).image_url" :src="bookFor(pin.book_id).image_url" alt="">
                <div>
                  <strong>{{ bookFor(pin.book_id).title || '(삭제되거나 숨김 처리된 책)' }}</strong>
                  <small>{{ pin.book_id }}</small>
                </div>
              </div>
            </td>
            <td>{{ periodLabel(pin) }}</td>
            <td><span class="badge" :class="pinStatus(pin).className">{{ pinStatus(pin).label }}</span></td>
            <td class="pin-actions">
              <button class="mini" :disabled="index === 0" @click="movePin(pin, -1)">↑</button>
              <button class="mini" :disabled="index === sortedPins.length - 1" @click="movePin(pin, 1)">↓</button>
              <button class="mini" @click="editPin(pin)">수정</button>
              <button class="mini danger" @click="deletePin(pin['.key'])">삭제</button>
            </td>
          </tr>
          <tr v-if="sortedPins.length === 0">
            <td colspan="5" class="empty">등록된 핀이 없습니다. 자동 선정 5권만 노출됩니다.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="section">
      <div class="preview-head">
        <div>
          <h2>현재 최종 캐러셀</h2>
          <p>서버가 생성한 <code>home_dynamic/current.carousel</code> 순서입니다.</p>
        </div>
        <button class="button" @click="loadFinalCarousel">새로고침</button>
      </div>
      <div class="preview-list">
        <div class="preview-card" v-for="(bookId, index) in finalCarousel" :key="bookId">
          <span class="slot">{{ index + 1 }}</span>
          <img v-if="bookFor(bookId).image_url" :src="bookFor(bookId).image_url" alt="">
          <div class="preview-copy">
            <strong>{{ bookFor(bookId).title || bookId }}</strong>
            <small>{{ bookId }}</small>
            <span class="source" :class="isPinnedBook(bookId) ? 'manual' : 'automatic'">
              {{ isPinnedBook(bookId) ? '수동 핀' : '자동 선정' }}
            </span>
          </div>
        </div>
        <div v-if="finalCarousel.length === 0" class="empty">아직 생성된 캐러셀이 없습니다.</div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore } from '../main'
import Header from './components/Header'

export default {
  name: 'EditMainBookView',
  components: { Header },
  firestore () {
    return {
      books: firestore.collection('books').orderBy('title', 'asc'),
      pins: firestore.collection('home_carousel_pins').orderBy('position', 'asc')
    }
  },
  data () {
    return {
      editingId: '',
      bookSearch: '',
      selectedBookId: '',
      position: 1,
      isActive: true,
      startDate: '',
      endDate: '',
      finalCarousel: [],
      saving: false,
      refreshStatus: ''
    }
  },
  computed: {
    allBooks () {
      return Array.isArray(this.books) ? this.books : []
    },
    allPins () {
      return Array.isArray(this.pins) ? this.pins : []
    },
    filteredBooks () {
      const q = this.bookSearch.trim().toLowerCase()
      return this.allBooks.filter(book => {
        if (book.hidden === true) return false
        return !q || (book.title || '').toLowerCase().includes(q)
      })
    },
    bookMap () {
      const result = {}
      this.allBooks.forEach(book => { result[book['.key']] = book })
      return result
    },
    sortedPins () {
      return this.allPins.slice().sort((a, b) =>
        Number(a.position || 0) - Number(b.position || 0) ||
        String(a['.key']).localeCompare(String(b['.key']))
      )
    },
    maxPosition () {
      return Math.max(1, this.allPins.length + (this.editingId ? 5 : 6))
    },
    effectivePinnedBookIds () {
      return new Set(this.allPins.filter(pin => this.pinStatus(pin).effective).map(pin => pin.book_id))
    }
  },
  mounted () {
    this.loadFinalCarousel()
  },
  methods: {
    today () {
      return this.$moment().format('YYYY-MM-DD')
    },
    bookFor (bookId) {
      return this.bookMap[bookId] || {}
    },
    pinStatus (pin) {
      if (pin.is_active !== true) return { label: '비활성', className: 'off', effective: false }
      const today = this.today()
      if (pin.start_date && pin.start_date > today) {
        return { label: '예약', className: 'scheduled', effective: false }
      }
      if (pin.end_date && pin.end_date < today) {
        return { label: '종료', className: 'ended', effective: false }
      }
      return { label: '노출 중', className: 'active', effective: true }
    },
    periodLabel (pin) {
      return `${pin.start_date || '즉시'} ~ ${pin.end_date || '계속'}`
    },
    isPinnedBook (bookId) {
      return this.effectivePinnedBookIds.has(bookId)
    },
    validateForm () {
      const book = this.allBooks.find(b => b['.key'] === this.selectedBookId)
      if (!book || book.hidden === true) return '노출 가능한 책을 선택해주세요.'
      if (!Number.isInteger(Number(this.position)) || Number(this.position) < 1) {
        return '위치는 1 이상의 정수여야 합니다.'
      }
      if (Number(this.position) > this.maxPosition) {
        return `현재 위치는 ${this.maxPosition} 이하여야 합니다.`
      }
      if (this.startDate && this.endDate && this.startDate > this.endDate) {
        return '종료일은 시작일보다 빠를 수 없습니다.'
      }
      const collision = this.allPins.find(pin =>
        pin['.key'] !== this.editingId && pin.is_active === true &&
        Number(pin.position) === Number(this.position)
      )
      if (this.isActive && collision) return '같은 위치에 활성 핀이 이미 있습니다.'
      const duplicate = this.allPins.find(pin =>
        pin['.key'] !== this.editingId && pin.is_active === true &&
        pin.book_id === this.selectedBookId
      )
      if (this.isActive && duplicate) return '같은 책의 활성 핀이 이미 있습니다.'
      return ''
    },
    clearForm () {
      this.editingId = ''
      this.bookSearch = ''
      this.selectedBookId = ''
      this.position = this.allPins.length + 1
      this.isActive = true
      this.startDate = ''
      this.endDate = ''
    },
    editPin (pin) {
      this.editingId = pin['.key']
      this.selectedBookId = pin.book_id
      this.bookSearch = this.bookFor(pin.book_id).title || ''
      this.position = Number(pin.position) || 1
      this.isActive = pin.is_active === true
      this.startDate = pin.start_date || ''
      this.endDate = pin.end_date || ''
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    async savePin () {
      const error = this.validateForm()
      if (error) {
        window.alert(error)
        return
      }
      this.saving = true
      const before = Date.now()
      const data = {
        book_id: this.selectedBookId,
        position: Number(this.position),
        is_active: this.isActive,
        start_date: this.startDate || null,
        end_date: this.endDate || null,
        updated_at: new Date()
      }
      try {
        if (this.editingId) {
          await firestore.collection('home_carousel_pins').doc(this.editingId).update(data)
        } else {
          data.created_at = new Date()
          await firestore.collection('home_carousel_pins').add(data)
        }
        this.clearForm()
        await this.waitForCarouselRefresh(before)
      } catch (e) {
        console.error('savePin failed', e)
        window.alert(`저장 실패: ${e.message}`)
      } finally {
        this.saving = false
      }
    },
    async deletePin (id) {
      if (!window.confirm('이 핀을 삭제할까요?')) return
      const before = Date.now()
      try {
        await firestore.collection('home_carousel_pins').doc(id).delete()
        if (this.editingId === id) this.clearForm()
        await this.waitForCarouselRefresh(before)
      } catch (e) {
        console.error('deletePin failed', e)
        window.alert(`삭제 실패: ${e.message}`)
      }
    },
    async movePin (pin, direction) {
      const index = this.sortedPins.findIndex(item => item['.key'] === pin['.key'])
      const other = this.sortedPins[index + direction]
      if (!other) return
      const before = Date.now()
      const batch = firestore.batch()
      const now = new Date()
      batch.update(firestore.collection('home_carousel_pins').doc(pin['.key']), {
        position: Number(other.position),
        updated_at: now
      })
      batch.update(firestore.collection('home_carousel_pins').doc(other['.key']), {
        position: Number(pin.position),
        updated_at: now
      })
      try {
        await batch.commit()
        await this.waitForCarouselRefresh(before)
      } catch (e) {
        console.error('movePin failed', e)
        window.alert(`순서 변경 실패: ${e.message}`)
      }
    },
    async loadFinalCarousel () {
      try {
        const snap = await firestore.collection('home_dynamic').doc('current').get()
        const data = snap.exists ? snap.data() : {}
        this.finalCarousel = Array.isArray(data.carousel) ? data.carousel : []
        return data.updated_at && data.updated_at.toMillis
          ? data.updated_at.toMillis()
          : 0
      } catch (e) {
        console.error('loadFinalCarousel failed', e)
        this.refreshStatus = `미리보기 조회 실패: ${e.message}`
        return 0
      }
    },
    async waitForCarouselRefresh (afterMs) {
      this.refreshStatus = '편성 갱신 중…'
      for (let i = 0; i < 10; i++) {
        const updatedAt = await this.loadFinalCarousel()
        if (updatedAt >= afterMs) {
          this.refreshStatus = '편성 갱신 완료'
          return
        }
        await new Promise(resolve => window.setTimeout(resolve, 1500))
      }
      this.refreshStatus = '핀은 저장됨 · 편성 갱신 대기'
    }
  }
}
</script>

<style scoped>
.intro h1, h2 { margin-bottom: 8px; }
.intro p { margin: 4px 0; color: #555; }
.status { min-height: 20px; color: #18864b !important; }
.status.waiting { color: #b26a00 !important; }
.form-panel { background: #f7f9fb; border-radius: 8px; }
.field { margin-bottom: 14px; }
.field label { display: block; margin-bottom: 5px; font-weight: 600; }
.field small { display: block; margin-top: 4px; color: #777; }
.row { display: flex; gap: 14px; flex-wrap: wrap; }
.compact { flex: 1; min-width: 170px; }
.checkbox-field { display: flex; align-items: center; padding-top: 24px; }
.actions { display: flex; gap: 8px; }
.button { border: 1px solid #cfd6dc; background: white; border-radius: 5px; padding: 8px 14px; cursor: pointer; }
.button.primary { background: #2d8cf0; border-color: #2d8cf0; color: white; }
.button:disabled { opacity: .5; cursor: default; }
.pin-table { width: 100%; border-collapse: collapse; }
.pin-table th, .pin-table td { border-bottom: 1px solid #e5e8eb; padding: 10px; text-align: left; vertical-align: middle; }
.position { width: 60px; font-size: 1.2em; font-weight: 700; }
.book-cell { display: flex; align-items: center; gap: 10px; }
.book-cell img { width: 42px; height: 62px; object-fit: cover; border-radius: 3px; }
.book-cell small, .preview-copy small { display: block; color: #888; }
.pin-actions { white-space: nowrap; }
.mini { margin-right: 4px; padding: 5px 8px; border: 1px solid #ccd3d9; background: white; border-radius: 4px; cursor: pointer; }
.mini.danger { color: #c0392b; }
.badge, .source { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: .8em; }
.badge.active { background: #daf5e5; color: #17733c; }
.badge.off, .badge.ended { background: #eceff1; color: #666; }
.badge.scheduled { background: #fff0cc; color: #8b5e00; }
.preview-head { display: flex; justify-content: space-between; align-items: center; }
.preview-head p { margin: 0; color: #666; }
.preview-list { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.preview-card { position: relative; display: flex; width: 260px; min-height: 112px; border: 1px solid #e1e5e8; border-radius: 8px; padding: 10px; gap: 10px; background: white; }
.preview-card img { width: 62px; height: 92px; object-fit: cover; border-radius: 4px; }
.slot { position: absolute; top: -8px; left: -8px; width: 24px; height: 24px; border-radius: 50%; background: #222; color: white; text-align: center; line-height: 24px; font-weight: 700; }
.preview-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; justify-content: center; }
.preview-copy strong { margin-bottom: 4px; }
.source { margin-top: 8px; align-self: flex-start; }
.source.manual { background: #e7dbff; color: #5b2d90; }
.source.automatic { background: #dceeff; color: #245b88; }
.empty { padding: 24px !important; color: #888; text-align: center !important; }
</style>
