<template>
  <div>
    <Header></Header>

    <div>
      시작기간
      <datepicker v-model="start_date"></datepicker>
      종료기간
      <datepicker v-model="end_date"></datepicker>
      <div class='button' @click='refreshData'>조회하기 </div>
    </div>
    <div style="height: 100px"/>
    <EventCountData title='NEW 추천 도서' :datas="time_datas"/>
    <div style="height: 100px"/>
    <EventCountData title='프리뷰 도서' :datas="limit_datas"/>

  </div>
</template>

<script>
import { firestore, firestorage } from '../main'
import Header from './components/Header'
import EventCountData from './components/EventCountData'
import Datepicker from 'vuejs-datepicker'
import _ from 'lodash';

export default {
  name: 'EventCountView',
  components: {
    Header, EventCountData, Datepicker
  },
  async mounted () {
    await this.refreshData();
  },
  data () {
    return {
      start_date: this.$moment().subtract(7, 'days').toDate(),
      end_date: this.$moment().add(1, 'days').toDate(),
      time_datas: {},
      limit_datas: {}
    }
  },
  methods: {
    async refreshData() {
      this.time_datas = {};
      this.limit_datas = {};

      await this.loadEventData()
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

        this.time_datas = this.updateData(time_datas, dayly_event_counts.data()['time_datas'])
        this.limit_datas = this.updateData(limit_datas, dayly_event_counts.data()['limit_datas'])

        start = this.$moment(start).add(1, 'days')
      }

      const limitEvents = await firestore.collection('limit_event').get();
      for (let limitEvent of limitEvents.docs) {
        const eventData = limitEvent.data()
        const parent_user_count = eventData['user_count'] || 0
        const time_event_user_count = eventData['time_event_user_count'] || 0
        const user_count = parent_user_count + time_event_user_count
        // 세션 단위 로그 수 필드는 부모 문서에 없음. 사용자 수를 대체값으로 사용.
        const read_count = parent_user_count

        let book_id = eventData['book_id']

        let data = _.find(this.limit_datas, (v) => v['book_id'] == book_id);
        if (data) {
          data['show_reader_user_count'] = Math.max(user_count, data['show_reader_user_count'])
          data['show_reader_count'] += read_count

          console.log('limitEvent', data['show_reader_user_count'], data['show_reader_count'])
        }
      }

      const timeEvents = await firestore.collection('time_event').get();
      for (let timeEvent of timeEvents.docs) {
        const eventData = timeEvent.data()
        const user_count = eventData['user_count'] || 0
        // 세션 단위 로그 수 필드는 부모 문서에 없음. 사용자 수를 대체값으로 사용.
        const read_count = user_count

        let book_id = eventData['book_id']

        let data = _.find(this.time_datas, (v) => v['book_id'] == book_id);
        if (data) {
          data['show_reader_user_count'] = Math.max(user_count, data['show_reader_user_count'])
          data['show_reader_count'] += read_count

          console.log('timeEvent', data['show_reader_user_count'], data['show_reader_count'])
        }
      }
    },
    updateData(mainData, datas) {
      for (let key in datas) {
        const data = datas[key]

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
th {
  min-width: 100px
}
</style>
