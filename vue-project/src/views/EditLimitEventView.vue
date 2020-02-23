<template>
  <div>
    <Header></Header>
    <section class='section'>

    </section>
    <section class='section'>
      <div>
        <div>limitEvent_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='limitEvent_id'>
        </div>
      </div>
      <div>
        <div>book_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='book_id'>
        </div>
      </div>
      <div>
        <div>전체시간 (초, ex: 10분 -> 600)</div>
        <div class='control'>
          <input type='text' class='input' v-model='limit_seconds'>
        </div>
      </div>
      <div>
        <div>뉴추천 탐색 인원 수</div>
        <div class='control'>
          <input type='text' class='input' v-model='time_event_user_count'>
        </div>
      </div>
      <div class="Column">
        <div>활성화여부 - 기본이 켜진상태입니다.</div>
        <div class='control'>
          <input type="checkbox" id="checkbox" v-model="is_active">
          <label for="checkbox">활성화</label>
        </div>
      </div>
      <div>
        <div class='button' @click='addBanner'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='limitEvent in limitEvents' :key="limitEvent['.key']">
          <div class='notification'>
            <div>
              <h1>{{ limitEvent.book_id }}</h1>
              <h1>{{ bookName(limitEvent.book_id) }}</h1>
            </div>
            <div class='button' @click="selectBanner(limitEvent['.key'])">수정하기</div>
            <div class='button' @click="deleteBanner(limitEvent['.key'])">삭제</div>
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
  name: 'EditLimitEventView',
  components: {
    Header
  },
  firestore () {
    return {
      books: firestore.collection('books'),
      limitEvents: firestore.collection('limit_event'),
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
      limitEvent_id: '',
      book_id: '',
      limit_seconds: 600,
      is_active: true,
      time_event_user_count: 0,
    }
  },
  methods: {
    bookName(bookId) {
      for (let book of this.books) {
        if (book['.key'] === bookId) {
          return book['title']
        }
      }
      return ''
    },
    clearInput() {
      this.limitEvent_id = ''
      this.book_id = ''
      this.limit_seconds = 600
      this.is_active = true
      this.time_event_user_count = 0
    },
    addBanner () {
      if (this.limitEvent_id) {
        let data = {
          book_id: this.book_id,
          limit_seconds: this.limit_seconds,
          is_active: this.is_active,
          time_event_user_count: this.time_event_user_count
        }

        firestore.collection('limit_event').doc(this.limitEvent_id).update(data).then((docRef) => {
          console.log('update limitEvent without file')
          alert('수정 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('수정 실패')
        })

      } else {
        let newDocument = {
          book_id: this.book_id,
          limit_seconds: this.limit_seconds,
          is_active: this.is_active,
          time_event_user_count: this.time_event_user_count,
          read_history: []
        }
        firestore.collection('limit_event').add(newDocument).then((docRef) => {
          console.log('Document written with ID: ', docRef.id)
          alert('추가 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('추가 실패')
        })
      }
    },
    selectBanner (key) {
      for (let limitEvent of this.limitEvents) {
        if (limitEvent['.key'] == key) {
          console.log(limitEvent)
          this.limitEvent_id = limitEvent['.key']
          this.book_id = limitEvent['book_id']
          this.limit_seconds = limitEvent['limit_seconds']
          this.is_active = limitEvent['is_active']
          this.time_event_user_count = limitEvent['time_event_user_count'] || 0
        }
      }
    },
    deleteBanner (key) {
      firestore.collection('limit_event').doc(key).delete().then(() => {
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
