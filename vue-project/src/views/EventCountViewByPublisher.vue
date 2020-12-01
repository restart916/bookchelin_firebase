
<template>
  <div class="Root">
    <div class="Header">
      <router-link to="/publisher">돌아가기</router-link>
    </div>
    <div class="Row Border">
      <!-- <div class="Column">
        출판사 코드
        <input type='text' v-model="publisher_code"></input>
      </div> -->
      <div class="Column">
        시작날짜
        <datepicker v-model="start_date"></datepicker>
      </div>
      <div class="Column">
        종료날짜
        <datepicker v-model="end_date"></datepicker>
      </div>
      <div class="Column">
        <div class='button' @click='refreshData'>조회하기 </div>
      </div>
    </div>

    <div style="height: 100px"/>
    <EventCountData title='NEW 추천 도서'
                    :datas="time_datas"
                    hide_detail="1"
                    v-show='showTimeData'
                    />

    <div style="height: 100px"/>
    <EventCountData title='프리뷰 도서'
                    :datas="limit_datas"
                    hide_detail="1"
                    v-show='!is_loading'
                    />

    <circle2 class="Loading" v-show='is_loading'></circle2>
    <div class="Description">
      * 노출 인원 수 : 앱에서 출판사의 도서 이미지가 노출된 인원 수 (수치가 0인경우, 최상단 배너에 노출x)<br>
      * 상세페이지 인원 수 : 도서 정보 및 목차가 기재된 페이지에 접속한 인원 수<br>
      * 바로보기 인원 수 : 바로보기를 눌러 실제로 도서를 구독한 인원 수<br>
      * 1인당 평균 구독 시간 : 바로보기를 통해 1인당 도서를 읽은 평균 시간<br>
      * 공유버튼 클릭 수 : 공유버튼을 클릭하여 지인들에게 공유한 회수<br>
      * 구매버튼 클릭 수 : 구매버튼을 클릭하여 실제 구매의향을 보인 회수<br>
      <br><br>
    </div>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'
import Header from './components/Header'
import EventCountData from './components/EventCountData'
import Datepicker from 'vuejs-datepicker'
import {Circle2} from 'vue-loading-spinner'

export default {
  name: 'EventCountViewByPublisher',
  components: {
    Header, EventCountData, Datepicker, Circle2
  },
  async mounted () {
    let publisher_id = this.$route.params.publisher_id

    const publisher = await firestore.collection('publisher').doc(publisher_id).get()
    // console.log(publisher.data())
    if (publisher.data()) {
      this.publisher_code = publisher.data().code
      // await this.refreshData();
    } else {
      alert('잘못된 접근입니다.')
    }
  },
  data () {
    return {
      start_date: this.$moment().subtract(7, 'days').toDate(),
      end_date: this.$moment().add(1, 'days').toDate(),
      time_datas: {},
      limit_datas: {},
      publisher_code: '',

      is_loading: false,
    }
  },
  computed: {
    showTimeData() {
        // console.log(this.time_datas.length)
        return !this.is_loading && Object.keys(this.time_datas).length
    }
  },
  methods: {
    async refreshData() {
      this.is_loading = true;
      this.time_datas = {};
      this.limit_datas = {};

      if (this.publisher_code) {
          await this.loadEventData()
      }

      this.is_loading = false;
    },
    getTimeString(diff) {
      let ms = diff * 1000

      const hours = this.$moment.utc(ms).diff(0, 'hours')
      ms -= hours * 1000 * 60 * 60

      const minutes = this.$moment.utc(ms).diff(0, 'minutes')
      ms -= minutes * 1000 * 60

      const seconds = this.$moment.utc(ms).diff(0, 'seconds')

      return `${hours}시간 ${minutes}분 ${seconds}초`
    },
    async loadEventData() {

      let book_ids = []
      const books = await firestore.collection('books')
                                   .where('publisher', '==', this.publisher_code)
                                   .get()

      for (let book of books.docs) {
        book_ids.push(book.id)
      }

      let start = this.$moment(this.start_date)
      const end = this.$moment(this.end_date)

      let time_datas = {};
      let limit_datas = {};

      while(start < end){
        // console.log(start.format('YYYY-MM-DD'))

        const dayly_event_counts = await firestore.collection('dayly_event_count')
        .doc(start.format('YYYY-MM-DD'))
        .get()

        // console.log(dayly_event_counts.data());
        if (!dayly_event_counts.data()) {
          start = this.$moment(start).add(1, 'days')
          continue;
        }

        time_datas = this.updateData(book_ids, time_datas, dayly_event_counts.data()['time_datas'])
        limit_datas = this.updateData(book_ids, limit_datas, dayly_event_counts.data()['limit_datas'])

        start = this.$moment(start).add(1, 'days')
      }

      this.time_datas = time_datas
      this.limit_datas = limit_datas

      const limitEvents = await firestore.collection('limit_event').get();
      for (let limitEvent of limitEvents.docs) {
        const read_history = limitEvent.data()['read_history']
        const time_event_user_count = limitEvent.data()['time_event_user_count']
        const user_count = read_history.length + time_event_user_count
        const read_count = _.sum(read_history.map((history) => history.logs.length))

        let book_id = limitEvent.data()['book_id']

        let data = _.find(this.limit_datas, (v) => v['book_id'] == book_id);
        if (data) {
          data['show_reader_user_count'] = Math.max(user_count, data['show_reader_user_count'])
          data['show_reader_count'] += read_count

          console.log('limitEvent', data['show_reader_user_count'], data['show_reader_count'])
        }
      }

      const timeEvents = await firestore.collection('time_event').get();
      for (let timeEvent of timeEvents.docs) {
        const read_history = timeEvent.data()['read_history']
        // const time_event_user_count = timeEvent.data()['time_event_user_count']
        const user_count = read_history.length // + time_event_user_count
        const read_count = _.sum(read_history.map((history) => history.datetime.length))

        let book_id = timeEvent.data()['book_id']

        let data = _.find(this.time_datas, (v) => v['book_id'] == book_id);
        if (data) {
          data['show_reader_user_count'] = Math.max(user_count, data['show_reader_user_count'])
          data['show_reader_count'] += read_count

          console.log('timeEvent', data['show_reader_user_count'], data['show_reader_count'])
        }
      }
    },
    updateData(book_ids, mainData, datas) {
      for (let key in datas) {
        const data = datas[key]

        if (book_ids.includes(data['book_id']) == false) {
          continue
        }

        let bookId = data['book_id'];
        let findData = _.find(mainData, (v) => v['book_id'] == bookId);

        if (findData) {
          if (findData['event_id'].includes(key) === false) {
            findData['event_id'].push(key)
          }

          // show recent data
          findData['total_read_time'] = data['total_read_time'];
          findData['avg_user_read_time'] = data['avg_user_read_time'];
          findData['average_review'] = data['average_review'];
          findData['review_count'] = data['review_count'];

          findData['create_time'] = findData['create_time'] || data['create_time'] ;

          findData['click_buy_book_count'] += data['click_buy_book_count'];
          findData['click_share_book_count'] += data['click_share_book_count'];
          findData['show_detail_count'] += data['show_detail_count'];
          findData['show_detail_user_count'] += data['show_detail_user_count'];
          findData['show_new_main_books'] += data['show_new_main_books'];
          findData['show_new_main_user_count'] += data['show_new_main_user_count'];
          // findData['show_reader_count'] += data['show_reader_count'];
          // findData['show_reader_user_count'] += data['show_reader_user_count'];
        } else {
          mainData[bookId] = {
            'event_id': [key],
            'book_id': data['book_id'],

            'average_review': data['average_review'],
            'avg_user_read_time': data['avg_user_read_time'],
            'create_time': data['create_time'],
            'book_name': data['book_name'],
            'click_buy_book_count': data['click_buy_book_count'],
            'click_share_book_count': data['click_share_book_count'],
            'review_count': data['review_count'],
            'show_detail_count': data['show_detail_count'],
            'show_detail_user_count': data['show_detail_user_count'],
            'show_new_main_books': data['show_new_main_books'],
            'show_new_main_user_count': data['show_new_main_user_count'],
            // 'show_reader_count': data['show_reader_count'],
            // 'show_reader_user_count': data['show_reader_user_count'],
            'show_reader_count': 0,
            'show_reader_user_count': 0,
            'total_read_time': data['total_read_time'],
          };
        }
      }

      return mainData;
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
.Header {
  display: flex;
  margin-bottom: 20px;
}
.Loading {
  margin-left: 200px;
}
.Root {
  margin-left: 10px;
}
th {
  min-width: 100px;
}
.Border {
  border: solid 1px;
}
.Row {
  display: table;
  width: 40%; /*Optional*/
  table-layout: fixed; /*Optional*/
  border-spacing: 10px; /*Optional*/
}
.Column {
  text-align: left;
  display: table-cell;
}
.Description {
  text-align: left;
  margin-top: 50px;
}
</style>
