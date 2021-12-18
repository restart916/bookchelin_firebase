<template>
  <div>
    <router-link to="/edit">기본 도서 등록</router-link>
    <router-link to="/edit-banner">공지 이벤트</router-link>
    <router-link to="/edit-time-event">NEW 추천 책 등록</router-link>
    <router-link to="/edit-main-book">NEW 추천 롤링 베너</router-link>
    <router-link to="/edit-limit-event">프리뷰 책 등록</router-link>
    <router-link to="/edit-suggest-book">기획전</router-link>
    <router-link to="/edit-link-select">링크셀렉트</router-link>
    <router-link to="/edit-log-select">로그셀렉트</router-link>
    <router-link to="/count-time">읽은 기록</router-link>
    <router-link to="/event-count">출판사 통계</router-link>
    <router-link to="/edit-review">리뷰 검사</router-link>
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
