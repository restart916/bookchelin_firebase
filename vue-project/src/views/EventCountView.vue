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
    <EventCountData title='얼리버드 도서' :datas="time_datas"/>
    <div style="height: 100px"/>
    <EventCountData title='저스트텐미닛 도서' :datas="limit_datas"/>

  </div>
</template>

<script>
import { firestore, firestorage } from '../main'
import Header from './components/Header'
import EventCountData from './components/EventCountData'
import Datepicker from 'vuejs-datepicker'

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
      start_date: this.$moment().subtract(30, 'days').toDate(),
      end_date: this.$moment().add(1, 'days').toDate(),
      time_datas: [],
      limit_datas: []
    }
  },
  methods: {
    async refreshData() {
      this.time_datas = await this.loadEventData('time_event');
      this.limit_datas = await this.loadEventData('limit_event');
    },
    async loadEventData(type) {
      const time_events = await firestore.collection(type).get()
      // console.log(time_events)

      let datas = {}
      for (let time_event of time_events.docs) {
        // console.log('time_event.data()', time_event.data())
        const event_id = time_event['id']
        const time_event_data = time_event.data()
        datas[event_id] = {'book_id': time_event_data['book_id']}

        const book_data = await firestore
                                .collection('books')
                                .doc(time_event_data['book_id'])
                                .get()
        datas[event_id]['book_name'] = book_data.data()['title']

        const show_book_details = await firestore
                                        .collection('show_book_detail')
                                        .where('event_id', '==', event_id)
                                        .where('datetime', '>', this.$moment(this.start_date).unix())
                                        .where('datetime', '<', this.$moment(this.end_date).unix())
                                        .get()

        datas[event_id]['show_detail_count'] = show_book_details.docs.length
        // console.log('show_detail_count', show_book_details)

        const show_book_readers = await firestore
                                        .collection('show_book_reader')
                                        .where('event_id', '==', event_id)
                                        .where('datetime', '>', this.$moment(this.start_date).unix())
                                        .where('datetime', '<', this.$moment(this.end_date).unix())
                                        .get()

        datas[event_id]['show_reader_count'] = show_book_readers.docs.length
        // console.log('show_reader_count', show_book_readers)

        const click_buy_book_details = await firestore
                                        .collection('click_buy_book_detail')
                                        .where('event_id', '==', event_id)
                                        .where('datetime', '>', this.$moment(this.start_date).unix())
                                        .where('datetime', '<', this.$moment(this.end_date).unix())
                                        .get()

        datas[event_id]['click_buy_book_count'] = show_book_readers.docs.length
        // console.log('click_buy_book_count', click_buy_book_details)

        const reviews = await firestore.collection('book_reviews')
                                      .where('book_id', '==', time_event_data['book_id'])
                                      .get()

        datas[event_id]['review_count'] = reviews.docs.length
        let rating = 0
        for (let review of reviews.docs) {
          rating += review.data()['rating']
        }
        datas[event_id]['average_review'] = reviews.docs.length ? (rating / reviews.docs.length) : 0
      }

      return datas
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
