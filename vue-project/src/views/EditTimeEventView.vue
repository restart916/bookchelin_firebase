<template>
  <div>
    <Header></Header>
    <section class='section'>

    </section>
    <section class='section'>
      <div>
        <div>timeEvent_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='timeEvent_id'>
        </div>
      </div>
      <div>
        <div>book_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='book_id'>
        </div>
      </div>
      <div>
        <div>전체시간 (초, ex: 100시간 -> 360000)</div>
        <div class='control'>
          <input type='text' class='input' v-model='event_minute'>
        </div>
      </div>
      <div>
        <div>남은시간 (처음 등록시 위 전체시간과 동일하게 적어주세요, ex: 360000)</div>
        <div class='control'>
          <input type='text' class='input' v-model='remain_time'>
        </div>
      </div>
      <div>
        <div>등록날짜</div>
        <div class='control'>
          <input type='text' class='input' v-model='create_time'>
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
        <div class='columns' v-for='timeEvent in timeEvents' :key="timeEvent['.key']">
          <div class='notification'>
            <div>
              <h1>{{ timeEvent.book_id }}</h1>
              <h1>{{ bookName(timeEvent.book_id) }}</h1>
            </div>
            <div class='button' @click="selectBanner(timeEvent['.key'])">수정하기</div>
            <div class='button' @click="deleteBanner(timeEvent['.key'])">삭제</div>
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
  name: 'EditTimeEventView',
  components: {
    Header
  },
  firestore () {
    return {
      books: firestore.collection('books'),
      timeEvents: firestore.collection('time_event'),
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
      timeEvent_id: '',
      book_id: '',
      event_minute: 360000,
      remain_time: 360000,
      is_active: true,
      create_time: ''
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
      this.timeEvent_id = ''
      this.book_id = ''
      this.event_minute = 360000
      this.remain_time = 360000
      this.is_active = true
      this.create_time = ''
    },
    addBanner () {
      if (this.timeEvent_id) {
        let data = {
          book_id: this.book_id,
          event_minute: this.event_minute,
          remain_time: this.remain_time,
          is_active: this.is_active,
          create_time: this.create_time
        }

        firestore.collection('time_event').doc(this.timeEvent_id).update(data).then((docRef) => {
          console.log('update timeEvent without file')
          alert('수정 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('수정 실패')
        })

      } else {
        let newDocument = {
          book_id: this.book_id,
          event_minute: this.event_minute,
          remain_time: this.remain_time,
          is_active: this.is_active,
          create_time: this.create_time,
          read_history: []
        }
        firestore.collection('time_event').add(newDocument).then((docRef) => {
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
      for (let timeEvent of this.timeEvents) {
        if (timeEvent['.key'] == key) {
          console.log(timeEvent)
          this.timeEvent_id = timeEvent['.key']
          this.book_id = timeEvent['book_id']
          this.event_minute = timeEvent['event_minute']
          this.remain_time = timeEvent['remain_time']
          this.is_active = timeEvent['is_active']
          this.create_time = timeEvent['create_time']
        }
      }
    },
    deleteBanner (key) {
      firestore.collection('time_event').doc(key).delete().then(() => {
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
