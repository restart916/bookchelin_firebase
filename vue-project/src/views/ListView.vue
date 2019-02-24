<template>
  <section class="section">
    <div class="container">
      <!-- <div class="columns" v-for="book in books" :key="book['.key']">
        <div class="notification">
          <router-link :to="{ name: 'ContentsView', params: { key: book['.key'] }}">
            <h1 class="title">{{ book.title }}</h1>
          </router-link>
        </div>
        <div>
        </div>
      </div> -->
    </div>
  </section>
</template>

<script>
import { firestore } from '../main'

export default {
  name: 'ListView',
  firestore () {
    return {
      // newzes: firestore.collection('newz').orderBy('datetime', 'desc')
      books: firestore.collection('books')
    }
  },
  mounted () {

  },
  data () {
    return {
      msg: 'Welcome to Your Vue.js App'
    }
  },
  methods: {
    test: () => {

    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.title {
  font-size: 18px;
}
</style>
