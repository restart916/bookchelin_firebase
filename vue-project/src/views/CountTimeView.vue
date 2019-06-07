<template>
  <div>
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

export default {
  name: 'CountTimeView',
  mounted () {
    this.$binding("books", firestore.collection('books').orderBy('description', 'desc'))
    .then((books) => {
      // console.log(books)

      this.data = []
      for (let book of books) {
        // console.log(book)
        this.data.push({
          bookTitle: book.title, bookId: book['.key'], count: 0
        })
      }

      this.$binding("dayly_total_time", firestore.collection('dayly_total_time'))
      .then((dayly_total_time) => {
        dayly_total_time.forEach(total => {
          let date = total['.key']
          let count_list = total.total_count
          this.data.forEach(item => {item[date] = 0})

          if (!(this.date_list.includes(date))) {
            this.date_list.push(date)
          }

          for (let key in count_list) {

            let data_info = this.data.find(item => item.bookId == key)
            // console.log(key, data_info)
            if (data_info) {
              data_info[date] = count_list[key]
              data_info['count'] += count_list[key]
            }
          }

        })

        console.log(this.date_list)
        // console.log(this.data)

      })
    })
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
