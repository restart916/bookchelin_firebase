<template>
  <div>
    <Header></Header>
    <section class='section'>
      1. 추가하기 - book_id 를 제외한 데이터를 입력하고 add 버튼을 누른다<br>
      2. 삭제하기 - 아래 목록에서 삭제버튼을 누른다<br>
      3. 수정하기 - 아래 목록에서 수정하기 버튼을 누른다. 위에 입력란에 데이터가 채워지면 수정하고 다시 add 버튼을 누른다<br>
      * - 수정하기할때 파일은 추가 안해도 내용만 수정가능합니다<br>
    </section>
    <section class='section'>
      <div>
        <div>book_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='book_id'>
        </div>
      </div>
      <div>
        <div>title</div>
        <div class='control'>
          <input type='text' class='input' v-model='title'>
        </div>
      </div>
      <div class="Row">
        <div class="Column">
          <div>description</div>
          <div class='control'>
            <textarea type='text' class='input' v-model='description'>
            </textarea>
          </div>
        </div>
        <div class="Column">
          <div>table of contents</div>
          <div class='control'>
            <textarea type='text' class='input' v-model='toc'>
            </textarea>
          </div>
        </div>
      </div>
      <div>
        <div>image_url</div>
        <div class='control'>
          <input type='text' class='input' v-model='image_url'>
        </div>
      </div>
      <div>
        <div>순서 - 숫자로 입력하세요</div>
        <div class='control'>
          <input type='text' class='input' v-model='order'>
        </div>
      </div>
      <div>
        <div>shop_yes24_link</div>
        <div class='control'>
          <input type='text' class='input' v-model='shop_yes24_link'>
        </div>
      </div>
      <div>
        <div>shop_bandi_link</div>
        <div class='control'>
          <input type='text' class='input' v-model='shop_bandi_link'>
        </div>
      </div>
      <div>
        <div>shop_inter_link</div>
        <div class='control'>
          <input type='text' class='input' v-model='shop_inter_link'>
        </div>
      </div>
      <div class="Row">
        <div class="Column">
          <div>카테고리 - 필수로 선택해주세요</div>
          <select v-model="category">
            <option disabled value="0">선택해주세요</option>
            <option v-for="category in book_category" :key="category.key"
              :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </div>
        <div class="Column">
          <div>숨김여부 - 체크시 앱에서 보이지 않게 됩니다</div>
          <div class='control'>
            <input type="checkbox" id="checkbox" v-model="hidden">
            <label for="checkbox">숨기기</label>
          </div>
        </div>
      </div>
      <div>
        <div>epub_file</div>
        <div class='control'>
          <input type='file' class='input' @change='onChangeFile'>
        </div>
      </div>
      <div>
        <div>pdf_file</div>
        <div class='control'>
          <input type='file' class='input' @change='onChangePdfFile'>
        </div>
      </div>
      <div>
        <div class='button' @click='addBook'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='book in books' :key="book['.key']">
          <div class='notification Row'>
            <h1 class='title Column'>{{ book.title }}</h1>
            <div class='button Column' @click="selectBook(book['.key'])">수정하기</div>
            <div class='button Column' @click="deleteBook(book['.key'])">삭제</div>
          </div>
        </div>
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
      book_category: firestore.collection('book_category').orderBy('id', 'desc')
    }
  },
  mounted () {

  },
  data () {
    return {
      book_id: '',
      title: '',
      description: '',
      toc: '',
      image_url: '',
      epub_file: '',
      firestore_url: '',
      uploadFile: null,
      uploadPdfFile: null,
      category: 0,
      order: 0,
      hidden: false,
      shop_yes24_link: '',
      shop_bandi_link: '',
      shop_inter_link: '',
    }
  },
  methods: {
    onChangeFile(event) {
      console.log('changeFile: ', event.target.files)
      this.uploadFile = event.target.files[0]
    },
    onChangePdfFile(event) {
      console.log('changeFile: ', event.target.files)
      this.uploadPdfFile = event.target.files[0]
    },
    clearInput() {
      this.book_id = ''
      this.title = ''
      this.description = ''
      this.toc = ''
      this.image_url = ''
      this.firestore_url = ''
      this.uploadFile = null
      this.uploadPdfFile = null
      this.category = 0
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
            filepath = 'epub/'+this.uploadFile.name
          } else {
            filepath = 'pdf/'+this.uploadPdfFile.name
          }
          let upload_ref = firestorage.ref().child(filepath)

          upload_ref.put(this.uploadFile).then((snapshot) => {
            console.log('Uploaded file!');

            let data = {
              title: this.title,
              description: this.description,
              toc: this.toc,
              image_url: this.image_url,
              firestore_url: filepath,
              category: this.category,
              order: this.order,
              hidden: this.hidden,
              shop_yes24_link: this.shop_yes24_link,
              shop_bandi_link: this.shop_bandi_link,
              shop_inter_link: this.shop_inter_link,
            }

            firestore.collection('books').doc(this.book_id).update(data).then((docRef) => {
              console.log('update book with file')
              alert('수정 성공')
              this.clearInput()
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
            order: this.order,
            hidden: this.hidden,
            shop_yes24_link: this.shop_yes24_link,
            shop_bandi_link: this.shop_bandi_link,
            shop_inter_link: this.shop_inter_link,
          }

          firestore.collection('books').doc(this.book_id).update(data).then((docRef) => {
            console.log('update book without file')
            alert('수정 성공')
            this.clearInput()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('수정 실패')
          })
        }

      } else {
        if (this.uploadFile == null) {
          alert('퍄일을 등록해주세요')
          return
        }

        let filepath = 'epub/'+this.uploadFile.name
        let upload_ref = firestorage.ref().child(filepath)
        upload_ref.put(this.uploadFile).then((snapshot) => {
          console.log('Uploaded file!');

          let newDocument = {
            title: this.title,
            description: this.description,
            toc: this.toc,
            image_url: this.image_url,
            firestore_url: filepath,
            category: this.category,
            order: this.order,
            hidden: this.hidden,
            shop_yes24_link: this.shop_yes24_link,
            shop_bandi_link: this.shop_bandi_link,
            shop_inter_link: this.shop_inter_link,
          }
          firestore.collection('books').add(newDocument).then((docRef) => {
            console.log('Document written with ID: ', docRef.id)
            alert('추가 성공')
            this.clearInput()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('추가 실패')
          })
        });
      }
    },
    selectBook (key) {
      for (let book of this.books) {
        if (book['.key'] == key) {
          console.log(book)
          this.book_id = book['.key']
          this.title = book['title']
          this.description = book['description']
          this.toc = 'toc' in book ? book['toc'] : ''
          this.image_url = book['image_url']
          this.firestore_url = book['firestore_url']
          this.category = 'hidden' in book ? book['category'] : 0
          this.order = 'hidden' in book ? book['order'] : 0
          this.hidden = 'hidden' in book ? book['hidden'] : false
          this.shop_yes24_link = book['shop_yes24_link'] || ''
          this.shop_bandi_link = book['shop_bandi_link'] || ''
          this.shop_inter_link = book['shop_inter_link'] || ''
        }
      }
    },
    deleteBook (key) {
      if (!confirm("정말 삭제하십니까?")) {
        return;
      }

      firestore.collection('books').doc(key).delete().then(() => {
        console.log('Document successfully deleted!')
        alert('삭제 성공')
      }).catch((error) => {
        console.error('Error removing document: ', error)
        alert('삭제 실패')
      })
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
.title{
  font-size: 20px;
}
.Row {
  display: table;
  width: 100%; /*Optional*/
  table-layout: fixed; /*Optional*/
  border-spacing: 10px; /*Optional*/
}
.Column {
  text-align: left;
  display: table-cell;
}
textarea {
  height: 200px;
}
</style>
