<template>
  <div>
    <table-component
       :data="data"
       sort-by="songs"
       sort-order="asc"
       >
       <table-column show="bookTitle" label="bookTitle"></table-column>
       <table-column show="bookId" label="bookId"></table-column>
       <table-column show="count" label="count" data-type="numeric"></table-column>
   </table-component>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'

export default {
  name: 'CountView',
  // firestore () {
  //   return {
  //     books: firestore.collection('books').orderBy('description', 'desc')
  //     // dayly_total: firestore.collection('dayly_total')
  //   }
  // },
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

      this.$binding("dayly_total", firestore.collection('dayly_total'))
      .then((dayly_total) => {
        // console.log(dayly_total)
        dayly_total.forEach(total => {
          let date = total['.key']
          let count_list = total.total_count
          this.data.forEach(item => {item[date] = 0})

          for (let key in count_list) {

            let data_info = this.data.find(item => item.bookId == key)
            console.log(key, data_info)
            if (data_info) {
              data_info[date] = count_list[key]
              data_info['count'] += count_list[key]
            }
          }
        })

        for (let total of dayly_total) {

        }
      })
    })
  },
  data () {
    return {
      data: []
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

</style>
