<template>
  <div>
    <Header></Header>

    <!-- 요약 + 필터 툴바 -->
    <section class="section toolbar">
      <div class="summary">
        총 <b>{{ allBooks.length }}</b>권
        · 활성 <b class="ok">{{ activeCount }}</b>
        · 숨김 <b class="muted">{{ hiddenCount }}</b>
        <span class="filtered">— 필터 결과 <b>{{ filteredBooks.length }}</b>권</span>
      </div>

      <div class="filters">
        <input class="f-search" v-model="searchText" placeholder="제목 검색">
        <select v-model="filterCategory">
          <option value="">전체 카테고리</option>
          <option v-for="c in book_category" :key="c.key" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="filterPublisher">
          <option value="__all">전체 출판사</option>
          <option value="">(출판사 없음)</option>
          <option v-for="p in publishers" :key="p.key" :value="p.code">{{ p.name }}</option>
        </select>
        <select v-model="filterStatus">
          <option value="">전체 상태</option>
          <option value="active">활성만</option>
          <option value="hidden">숨김만</option>
        </select>
        <button class="btn-reset" @click="resetFilters">필터 초기화</button>
        <button class="btn-add" @click="openCreate">＋ 새 책 추가</button>
      </div>
    </section>

    <!-- 추가/수정 폼 (기본 숨김, 버튼 클릭 시에만) -->
    <section v-if="showForm" class="section form-panel">
      <div class="form-head">
        <h2>{{ book_id ? '책 수정' : '새 책 추가' }}</h2>
        <button class="btn-close" @click="closeForm">✕ 닫기</button>
      </div>
      <div v-if="book_id" class="form-hint">수정 중: {{ book_id }} (파일은 변경 시에만 첨부)</div>

      <div class="field"><label>title</label><input class="input" v-model="title"></div>
      <div class="Row">
        <div class="Column"><label>description</label><textarea class="input" v-model="description"></textarea></div>
        <div class="Column"><label>table of contents</label><textarea class="input" v-model="toc"></textarea></div>
      </div>
      <div class="field"><label>image_url</label><input class="input" v-model="image_url"></div>
      <div class="field"><label>순서 (숫자)</label><input class="input" v-model="order"></div>
      <div class="Row">
        <div class="Column"><label>shop_yes24_link</label><input class="input" v-model="shop_yes24_link"></div>
        <div class="Column"><label>shop_kyobo_link</label><input class="input" v-model="shop_bandi_link"></div>
        <div class="Column"><label>shop_inter_link</label><input class="input" v-model="shop_inter_link"></div>
      </div>
      <div class="Row">
        <div class="Column">
          <label>카테고리 (필수)</label>
          <select v-model="category">
            <option disabled value="0">선택해주세요</option>
            <option v-for="c in book_category" :key="c.key" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="Column">
          <label>출판사 (optional)</label>
          <select v-model="publisher">
            <option value="">선택 없음</option>
            <option v-for="p in publishers" :key="p.key" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div class="Column">
          <label>숨김여부</label>
          <div><input type="checkbox" id="hidden_cb" v-model="hidden"><label for="hidden_cb"> 숨기기</label></div>
        </div>
      </div>
      <div class="Row">
        <div class="Column"><label>epub_file</label><input type="file" class="input" @change="onChangeFile"></div>
        <div class="Column"><label>pdf_file</label><input type="file" class="input" @change="onChangePdfFile"></div>
      </div>
      <div class="form-actions">
        <button class="btn-add" @click="addBook">{{ book_id ? '수정 저장' : '추가' }}</button>
        <button class="btn-reset" @click="closeForm">취소</button>
      </div>
    </section>

    <!-- 리스트 (현재 페이지만 렌더) -->
    <section class="section">
      <table class="list">
        <thead>
          <tr>
            <th class="c-cover"></th>
            <th class="c-title">제목</th>
            <th class="c-cat">카테고리</th>
            <th class="c-pub">출판사</th>
            <th class="c-status">상태</th>
            <th class="c-act">관리</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="book in pagedBooks" :key="book['.key']">
            <td class="c-cover">
              <img v-if="book.image_url" :src="book.image_url" referrerpolicy="no-referrer" alt="">
            </td>
            <td class="c-title">{{ book.title }}</td>
            <td class="c-cat">
              <select v-model="book.category" @change="onChangeBookCategory(book)">
                <option disabled value="0">선택</option>
                <option v-for="c in book_category" :key="c.key" :value="c.id">{{ c.name }}</option>
              </select>
            </td>
            <td class="c-pub">{{ publisherName(book.publisher) }}</td>
            <td class="c-status">
              <span :class="book.hidden ? 'badge hidden' : 'badge active'">
                {{ book.hidden ? '숨김' : '활성' }}
              </span>
            </td>
            <td class="c-act">
              <button class="btn-mini" @click="selectBook(book['.key'])">수정</button>
              <button class="btn-mini danger" @click="deleteBook(book['.key'])">삭제</button>
            </td>
          </tr>
          <tr v-if="pagedBooks.length === 0">
            <td colspan="6" class="empty">조건에 맞는 책이 없습니다.</td>
          </tr>
        </tbody>
      </table>

      <!-- 페이지네이션 -->
      <div class="pager">
        <span>페이지당</span>
        <select v-model.number="pageSize">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        <button class="btn-mini" :disabled="currentPage <= 1" @click="currentPage = 1">« 처음</button>
        <button class="btn-mini" :disabled="currentPage <= 1" @click="currentPage--">‹ 이전</button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }} 페이지</span>
        <button class="btn-mini" :disabled="currentPage >= totalPages" @click="currentPage++">다음 ›</button>
        <button class="btn-mini" :disabled="currentPage >= totalPages" @click="currentPage = totalPages">끝 »</button>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'
import Header from './components/Header'

export default {
  name: 'EditView',
  components: {
    Header
  },
  firestore () {
    return {
      books: firestore.collection('books').orderBy('title', 'asc'),
      book_category: firestore.collection('book_category').orderBy('id', 'desc'),
      publishers: firestore.collection('publisher')
    }
  },
  data () {
    return {
      // 필터/페이지 상태
      searchText: '',
      filterCategory: '',
      filterPublisher: '__all',
      filterStatus: '',
      pageSize: 20,
      currentPage: 1,
      // 폼 상태
      showForm: false,
      book_id: '',
      title: '',
      description: '',
      toc: '',
      image_url: '',
      firestore_url: '',
      uploadFile: null,
      uploadPdfFile: null,
      category: 0,
      publisher: '',
      order: 0,
      hidden: false,
      shop_yes24_link: '',
      shop_bandi_link: '',
      shop_inter_link: '',
    }
  },
  computed: {
    allBooks () {
      // vue-firestore 바인딩 로드 전에는 undefined 일 수 있음 — 항상 배열 보장
      return Array.isArray(this.books) ? this.books : []
    },
    activeCount () {
      return this.allBooks.filter(b => b.hidden !== true).length
    },
    hiddenCount () {
      return this.allBooks.filter(b => b.hidden === true).length
    },
    filteredBooks () {
      const q = this.searchText.trim().toLowerCase()
      return this.allBooks.filter(b => {
        if (q && !(b.title || '').toLowerCase().includes(q)) return false
        if (this.filterCategory && String(b.category) !== String(this.filterCategory)) return false
        if (this.filterPublisher !== '__all' && (b.publisher || '') !== this.filterPublisher) return false
        if (this.filterStatus === 'active' && b.hidden === true) return false
        if (this.filterStatus === 'hidden' && b.hidden !== true) return false
        return true
      })
    },
    totalPages () {
      return Math.max(1, Math.ceil(this.filteredBooks.length / this.pageSize))
    },
    pagedBooks () {
      const start = (this.currentPage - 1) * this.pageSize
      return this.filteredBooks.slice(start, start + this.pageSize)
    },
    publisherMap () {
      const m = {}
      const pubs = Array.isArray(this.publishers) ? this.publishers : []
      for (const p of pubs) m[p.code] = p.name
      return m
    }
  },
  watch: {
    // 필터/페이지 크기가 바뀌면 1페이지로
    searchText () { this.currentPage = 1 },
    filterCategory () { this.currentPage = 1 },
    filterPublisher () { this.currentPage = 1 },
    filterStatus () { this.currentPage = 1 },
    pageSize () { this.currentPage = 1 },
    // 필터 결과가 줄어 현재 페이지가 범위를 벗어나면 보정
    totalPages (val) { if (this.currentPage > val) this.currentPage = val }
  },
  methods: {
    publisherName (code) {
      if (!code) return '—'
      return this.publisherMap[code] || code
    },
    resetFilters () {
      this.searchText = ''
      this.filterCategory = ''
      this.filterPublisher = '__all'
      this.filterStatus = ''
      this.currentPage = 1
    },
    openCreate () {
      this.clearInput()
      this.showForm = true
    },
    closeForm () {
      this.showForm = false
      this.clearInput()
    },
    onChangeFile (event) {
      this.uploadFile = event.target.files[0]
    },
    onChangePdfFile (event) {
      this.uploadPdfFile = event.target.files[0]
    },
    onChangeBookCategory (book) {
      firestore.collection('books').doc(book['.key']).update({ category: book.category }).then(() => {
        alert(`${book.title} 카테고리 수정 성공`)
      }).catch(() => {
        alert(`${book.title} 수정 실패`)
      })
    },
    clearInput () {
      this.book_id = ''
      this.title = ''
      this.description = ''
      this.toc = ''
      this.image_url = ''
      this.firestore_url = ''
      this.uploadFile = null
      this.uploadPdfFile = null
      this.category = 0
      this.publisher = ''
      this.order = 0
      this.hidden = false
      this.shop_yes24_link = ''
      this.shop_bandi_link = ''
      this.shop_inter_link = ''
    },
    addBook () {
      if (this.category == 0) {
        alert('카테고리를 선택해주세요');
        return;
      }

      if (this.book_id) {
        if (this.uploadFile || this.uploadPdfFile) {
          let filepath = null
          if (this.uploadFile) {
            filepath = 'epub/' + this.uploadFile.name
          } else {
            filepath = 'pdf/' + this.uploadPdfFile.name
          }
          let upload_ref = firestorage.ref().child(filepath)

          upload_ref.put(this.uploadFile || this.uploadPdfFile).then(() => {
            let data = {
              title: this.title,
              description: this.description,
              toc: this.toc,
              image_url: this.image_url,
              firestore_url: filepath,
              category: this.category,
              publisher: this.publisher,
              order: this.order,
              hidden: this.hidden,
              shop_yes24_link: this.shop_yes24_link,
              shop_bandi_link: this.shop_bandi_link,
              shop_inter_link: this.shop_inter_link,
            }

            firestore.collection('books').doc(this.book_id).update(data).then(() => {
              alert('수정 성공')
              this.closeForm()
            }).catch((error) => {
              console.error('Error adding document: ', error)
              alert('수정 실패')
            })
          });
        } else {
          let data = {
            title: this.title,
            description: this.description,
            toc: this.toc,
            image_url: this.image_url,
            category: this.category,
            publisher: this.publisher,
            order: this.order,
            hidden: this.hidden,
            shop_yes24_link: this.shop_yes24_link,
            shop_bandi_link: this.shop_bandi_link,
            shop_inter_link: this.shop_inter_link,
          }

          firestore.collection('books').doc(this.book_id).update(data).then(() => {
            alert('수정 성공')
            this.closeForm()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('수정 실패')
          })
        }

      } else {
        let filepath = null
        if (this.uploadFile) {
          filepath = 'epub/' + this.uploadFile.name
        } else if (this.uploadPdfFile) {
          filepath = 'pdf/' + this.uploadPdfFile.name
        } else {
          alert('파일을 등록해주세요')
          return
        }

        let upload_ref = firestorage.ref().child(filepath)
        upload_ref.put(this.uploadFile || this.uploadPdfFile).then(() => {
          let newDocument = {
            title: this.title,
            description: this.description,
            toc: this.toc,
            image_url: this.image_url,
            firestore_url: filepath,
            category: this.category,
            publisher: this.publisher,
            order: this.order,
            hidden: this.hidden,
            shop_yes24_link: this.shop_yes24_link,
            shop_bandi_link: this.shop_bandi_link,
            shop_inter_link: this.shop_inter_link,
          }
          firestore.collection('books').add(newDocument).then((docRef) => {
            console.log('Document written with ID: ', docRef.id)
            alert('추가 성공')
            this.closeForm()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('추가 실패')
          })
        });
      }
    },
    selectBook (key) {
      for (let book of this.allBooks) {
        if (book['.key'] == key) {
          this.book_id = book['.key']
          this.title = book['title']
          this.description = book['description']
          this.toc = 'toc' in book ? book['toc'] : ''
          this.image_url = book['image_url']
          this.firestore_url = book['firestore_url']
          this.category = 'category' in book ? book['category'] : 0
          this.publisher = 'publisher' in book ? book['publisher'] : ''
          this.order = 'order' in book ? book['order'] : 0
          this.hidden = 'hidden' in book ? book['hidden'] : false
          this.shop_yes24_link = book['shop_yes24_link'] || ''
          this.shop_bandi_link = book['shop_bandi_link'] || ''
          this.shop_inter_link = book['shop_inter_link'] || ''
        }
      }
      this.showForm = true
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    deleteBook (key) {
      if (!confirm("정말 삭제하십니까?")) {
        return;
      }

      firestore.collection('books').doc(key).delete().then(() => {
        alert('삭제 성공')
      }).catch((error) => {
        console.error('Error removing document: ', error)
        alert('삭제 실패')
      })
    }
  }
}
</script>

<style scoped>
.section { padding: 14px 20px; }
.toolbar { background: #fafafa; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 5; }
.summary { font-size: 0.95em; margin-bottom: 10px; }
.summary .ok { color: #01875f; }
.summary .muted { color: #999; }
.summary .filtered { color: #d23669; margin-left: 6px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.filters input, .filters select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; }
.f-search { min-width: 200px; }

.btn-add { background: #d23669; color: #fff; border: none; border-radius: 4px; padding: 7px 14px; cursor: pointer; font-weight: 700; }
.btn-reset { background: #eee; border: 1px solid #ccc; border-radius: 4px; padding: 7px 12px; cursor: pointer; }
.btn-close { background: none; border: none; cursor: pointer; color: #888; }
.btn-mini { padding: 4px 9px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; font-size: 0.85em; margin: 0 2px; }
.btn-mini.danger { color: #c0392b; border-color: #e2b6b1; }
.btn-mini:disabled { opacity: 0.4; cursor: default; }

.form-panel { background: #fff; border: 2px solid #d23669; border-radius: 8px; margin: 14px 20px; }
.form-head { display: flex; justify-content: space-between; align-items: center; }
.form-head h2 { margin: 0; font-size: 1.1em; }
.form-hint { color: #888; font-size: 0.85em; margin: 6px 0; }
.field { margin: 8px 0; text-align: left; }
.field label, .Column label { display: block; font-size: 0.82em; color: #666; margin-bottom: 3px; }
.input { width: 100%; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
.form-actions { margin-top: 12px; display: flex; gap: 8px; }
textarea.input { height: 120px; }

.Row { display: table; width: 100%; table-layout: fixed; border-spacing: 8px; }
.Column { text-align: left; display: table-cell; }

.list { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.list th, .list td { border-bottom: 1px solid #eee; padding: 8px 6px; text-align: left; vertical-align: middle; }
.list th { background: #f7f7f8; color: #555; font-weight: 600; }
.c-cover { width: 44px; }
.c-cover img { width: 36px; height: 50px; object-fit: cover; border-radius: 3px; }
.c-cat { width: 130px; }
.c-pub { width: 120px; color: #666; }
.c-status { width: 70px; }
.c-act { width: 130px; white-space: nowrap; }
.list select { padding: 4px; border: 1px solid #ccc; border-radius: 4px; max-width: 120px; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 0.8em; }
.badge.active { background: #e3f6ef; color: #01875f; }
.badge.hidden { background: #eee; color: #999; }
.empty { text-align: center; color: #aaa; padding: 30px; }

.pager { display: flex; align-items: center; gap: 8px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
.pager select { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
.page-info { font-size: 0.9em; color: #555; min-width: 90px; text-align: center; }
</style>
