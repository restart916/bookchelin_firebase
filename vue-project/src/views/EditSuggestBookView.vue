<template>
  <div>
    <Header></Header>
    <section class='section'>
      <div>
        <div>suggest_group_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='suggest_id'>
        </div>
      </div>
      <div>
        <div>title</div>
        <div class='control'>
          <input type='text' class='input' v-model='title'>
        </div>
      </div>
      <div>
        <div>순서 - 숫자로 입력하세요</div>
        <div class='control'>
          <input type='text' class='input' v-model='order'>
        </div>
      </div>
      <div>
        <div>book id</div>
        <div v-for="(book_id, index) in books">
          <div>{{ book_id }}</div>
          <div>
            <div class='button' @click='removeBook(index)'>x</div>
          </div>
        </div>
        <div class='control'>
          <input type='text' class='input' v-model='book_id'>
        </div>
        <div>
          <div class='button' @click='addBook'>책 추가</div>
        </div>
      </div>
      <div>
        <div class='button' @click='addSuggest'>책추천그룹 추가/갱신</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='suggest in suggest_groups' :key="suggest['.key']">
          <div class='notification'>
            <div>
              <h1>{{ suggest.link_url }}</h1>
              <img :src='suggest.firestore_url' style="height: 80px"/>
            </div>
            <div class='button' @click="selectSuggest(suggest['.key'])">수정하기</div>
            <div class='button' @click="deleteSuggest(suggest['.key'])">삭제</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firestorage, fireauth } from '../main'
import Header from './components/Header'

export default {
  name: 'EditSuggestBookView',
  components: {
    Header
  },
  firestore () {
    return {
      suggest_groups: firestore.collection('suggest_group').orderBy('order', 'asc'),
    }
  },
  mounted () {
    fireauth.signInAnonymously().catch(function(error) {
      // Handle Errors here.
      var errorCode = error.code;
      var errorMessage = error.message;
      console.log('login error', error);
    });
  },
  data () {
    return {
      suggest_id: '',
      title: '',
      books: [],
      order: 0,
      book_id: ''
    }
  },
  methods: {
    clearInput() {
      this.suggest_id = ''
      this.title = ''
      this.books = []
      this.order = 0
      this.book_id = ''
    },
    addBook () {
      this.books.push(this.book_id);
      this.book_id = '';
    },
    removeBook (index) {
      this.books.splice(index, 1)
    },
    addSuggest () {
      if (this.suggest_id) {

        let data = {
          title: this.title,
          books: this.books,
          order: this.order,
        }

        firestore.collection('suggest_group').doc(this.suggest_id).update(data).then((docRef) => {
          console.log('update banner without file')
          alert('수정 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('수정 실패')
        })

      } else {
        let newDocument = {
          title: this.title,
          books: this.books,
          order: this.order,
        }
        firestore.collection('suggest_group').add(newDocument).then((docRef) => {
          console.log('Document written with ID: ', docRef.id)
          alert('추가 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('추가 실패')
        })
      };
    },
    selectSuggest (key) {
      for (let suggest_groups of this.suggest_groups) {
        if (suggest_groups['.key'] == key) {
          console.log(suggest_groups)
          this.suggest_id = suggest_groups['.key']
          this.title = suggest_groups['title']
          this.books = suggest_groups['books']
          this.order = suggest_groups['order']
        }
      }
    },
    deleteSuggest (key) {
      firestore.collection('suggest_group').doc(key).delete().then(() => {
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
