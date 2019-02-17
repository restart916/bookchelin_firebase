<template>
  <div>
    <section class='section'>
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
    addBook () {
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
          image_url: this.description,
          firestore_url: filepath,
        }
        firestore.collection('books').add(newDocument).then((docRef) => {
          console.log('Document written with ID: ', docRef.id)
          alert('추가 성공')
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('추가 실패')
        })
      });
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
