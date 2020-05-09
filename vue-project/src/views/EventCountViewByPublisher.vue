
<template>
  <div class="Root">
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
    <!-- <div style="height: 100px"/>
    <EventCountData title='NEW 추천 도서' :datas="time_datas" hide_detail="1"/> -->
    <div style="height: 100px"/>
    <EventCountData title='프리뷰 도서' :datas="limit_datas" hide_detail="1"/>

    <div class="Description">
      * 노출 인원 수 : 앱에서 출판사의 도서 이미지가 노출된 인원 수<br>
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

export default {
  name: 'EventCountViewByPublisher',
  components: {
    Header, EventCountData, Datepicker
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
    }
  },
  methods: {
    async refreshData() {
      this.time_datas = {};
      this.limit_datas = {};

      if (this.publisher_code) {
          await this.loadEventData()
      }
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

        this.time_datas = this.updateData(book_ids, time_datas, dayly_event_counts.data()['time_datas'])
        this.limit_datas = this.updateData(book_ids, limit_datas, dayly_event_counts.data()['limit_datas'])

        start = this.$moment(start).add(1, 'days')
      }
    },
    updateData(book_ids, mainData, datas) {
      for (let key in datas) {
        const data = datas[key]

        if (book_ids.includes(data['book_id']) == false) {
          continue
        }

        if (key in mainData) {
          // show recent data
          mainData[key]['total_read_time'] = data['total_read_time'];
          mainData[key]['avg_user_read_time'] = data['avg_user_read_time'];
          mainData[key]['average_review'] = data['average_review'];
          mainData[key]['review_count'] = data['review_count'];

          mainData[key]['create_time'] = mainData[key]['create_time'] || data['create_time'] ;

          mainData[key]['click_buy_book_count'] += data['click_buy_book_count'];
          mainData[key]['click_share_book_count'] += data['click_share_book_count'];
          mainData[key]['show_detail_count'] += data['show_detail_count'];
          mainData[key]['show_detail_user_count'] += data['show_detail_user_count'];
          mainData[key]['show_new_main_books'] += data['show_new_main_books'];
          mainData[key]['show_new_main_user_count'] += data['show_new_main_user_count'];
          mainData[key]['show_reader_count'] += data['show_reader_count'];
          mainData[key]['show_reader_user_count'] += data['show_reader_user_count'];
        } else {
          mainData[key] = {
            'average_review': data['average_review'],
            'avg_user_read_time': data['avg_user_read_time'],
            'book_id': data['book_id'],
            'create_time': data['create_time'],
            'book_name': data['book_name'],
            'click_buy_book_count': data['click_buy_book_count'],
            'click_share_book_count': data['click_share_book_count'],
            'review_count': data['review_count'],
            'show_detail_count': data['show_detail_count'],
            'show_detail_user_count': data['show_detail_user_count'],
            'show_new_main_books': data['show_new_main_books'],
            'show_new_main_user_count': data['show_new_main_user_count'],
            'show_reader_count': data['show_reader_count'],
            'show_reader_user_count': data['show_reader_user_count'],
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
