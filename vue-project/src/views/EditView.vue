<template>
  <div>
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
      <div>
        <div>description</div>
        <div class='control'>
          <input type='text' class='input' v-model='description'>
        </div>
      </div>
      <div>
        <div>image_url</div>
        <div class='control'>
          <input type='text' class='input' v-model='image_url'>
        </div>
      </div>
      <div>
        <div>epub_file</div>
        <div class='control'>
          <input type='file' class='input' @change='onChangeFile'>
        </div>
      </div>
      <div>
        <div class='button' @click='addBook'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='book in books' :key="book['.key']">
          <div class='notification'>
            <h1 class='title'>{{ book.title }}</h1>
            <div class='button' @click="selectBook(book['.key'])">수정하기</div>
            <div class='button' @click="deleteNewz(book['.key'])">삭제</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'

export default {
  name: 'EditView',
  firestore () {
    return {
      books: firestore.collection('books').orderBy('description', 'desc')
    }
  },
  mounted () {

  },
  data () {
    return {
      book_id: '',
      title: '',
      description: '',
      image_url: '',
      epub_file: '',
      firestore_url: '',
      uploadFile: null
    }
  },
  methods: {
    onChangeFile(event) {
      console.log('changeFile: ', event.target.files)
      this.uploadFile = event.target.files[0]
    },
    clearInput() {
      this.book_id = ''
      this.title = ''
      this.description = ''
      this.image_url = ''
      this.firestore_url = ''
      this.uploadFile = null
    },
    addBook () {
      if (this.book_id) {

        if (this.uploadFile) {
          let filepath = 'epub/'+this.uploadFile.name
          let upload_ref = firestorage.ref().child(filepath)
          upload_ref.put(this.uploadFile).then((snapshot) => {
            console.log('Uploaded file!');

            let data = {
              title: this.title,
              description: this.description,
              image_url: this.image_url,
              firestore_url: filepath,
            }

            firestore.collection('books').doc(this.book_id).update(data).then((docRef) => {
              console.log('update book with file')
              alert('추가 성공')
              this.clearInput()
            }).catch((error) => {
              console.error('Error adding document: ', error)
              alert('추가 실패')
            })
          });
        } else {
          let data = {
            title: this.title,
            description: this.description,
            image_url: this.image_url,
          }

          firestore.collection('books').doc(this.book_id).update(data).then((docRef) => {
            console.log('update book without file')
            alert('추가 성공')
            this.clearInput()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('추가 실패')
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
            image_url: this.image_url,
            firestore_url: filepath,
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
          this.image_url = book['image_url']
          this.firestore_url = book['firestore_url']
        }
      }
    },
    deleteNewz (key) {
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

</style>
