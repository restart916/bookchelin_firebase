<template>
  <div>
    <router-link to="/edit">책 등록</router-link>
    <router-link to="/edit-banner">메인페이지 하단 베너</router-link>
    <router-link to="/edit-main-book">메인 페이지 책</router-link>
    <router-link to="/count_time">읽은 기록</router-link>
  </div>
</template>

<script>
export default {
  name: 'Header',
  mounted () {
  },
  data () {
    return {}
  },
  methods: {
  }
}
</script>

<style scoped>
a {
  margin: 10px;
}
</style>
