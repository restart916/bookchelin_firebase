<template>
  <div>
    <table>
      <thead>
        <tr>
          <th>bookId</th>
          <th>bookTitle</th>
          <th>description</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="data_info in data">
          <td>{{ data_info.bookId }}</td>
          <td>{{ data_info.bookTitle }}</td>
          <td>{{ data_info.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'

export default {
  name: 'BookExport',
  mounted () {
    this.$binding("books", firestore.collection('books').orderBy('order', 'asc'))
    .then((books) => {

      this.data = []
      for (let book of books) {

        this.data.push({
          bookId: book['.key'],
          bookTitle: book.title,
          description: book.description,
        })
      }
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
