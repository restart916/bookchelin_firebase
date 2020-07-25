<template>
  <div>
    <Header></Header>
    <table>
      <thead>
        <tr>
          <th>bookTitle</th>
          <th>bookId</th>
          <th v-for="date_string in date_list" :key="date_string">{{ date_string }}</th>
          <th>count</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="data_info in data">
          <td>{{ data_info.bookTitle }}</td>
          <td>{{ data_info.bookId }}</td>
          <td v-for="date_string in date_list" >{{ data_info[date_string] }}</td>
          <td>{{ data_info.count }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'
import Header from './components/Header'

export default {
  name: 'CountTimeView',
  components: {
    Header
  },
  async mounted () {
    let books = await firestore.collection('books').orderBy('order', 'desc').get()

    this.data = []
    for (let book of books.docs) {
      // console.log(book)
      this.data.push({
        bookTitle: book.data()['title'], bookId: book.id, count: 0
      })
    }

    let daily_total_time = await firestore.collection('dayly_total_time').get()
    daily_total_time.docs.forEach(total => {
      // let date = total.id
      let date = this.$moment(total.id).format('YYYY-M')

      let count_list = total.data()['total_count']
      this.data.forEach(item => {
        if (date in item) {

        } else {
          item[date] = 0
        }
      })

      if (!(this.date_list.includes(date))) {
        this.date_list.push(date)
      }

      for (let key in count_list) {
        let data_info = this.data.find(item => item.bookId == key)

        if (data_info) {
          data_info[date] = count_list[key]
          data_info['count'] += count_list[key]
        } else {

        }
      }
    })

    // console.log(this.date_list)
  },
  data () {
    return {
      data: [],
      date_list: []
    }
  },
  methods: {
    test() {
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
