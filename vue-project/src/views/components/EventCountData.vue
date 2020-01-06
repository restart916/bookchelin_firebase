<template>
  <div>
    <div>{{ title }}</div>
    <table>
      <thead>
        <tr>
          <th>이벤트 ID</th>
          <th>도서 ID</th>
          <th>도서명</th>
          <th>뉴추천 노출 수</th>
          <th>도서 상세페이지 접속자 수(클릭 수)</th>
          <th>바로보기 접속자 수(클릭 수)</th>
          <th>총 읽은 시간</th>
          <th>이용자당 평균 읽은 시간</th>
          <th>공유버튼 클릭수</th>
          <th>구매버튼 클릭수</th>
          <th>리뷰평점 / 수</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(data, key) in datas">
          <td>{{ key }}</td>
          <td>{{ data['book_id'] }}</td>
          <td>{{ data['book_name'] }}</td>
          <td>{{ data['show_new_main_books'] }}</td>
          <td>{{ data['show_detail_user_count'] }} ({{ data['show_detail_count'] }})</td>
          <td>{{ data['show_reader_user_count'] }} ({{ data['show_reader_count'] }})</td>
          <td>{{ data['total_read_time'] }}</td>
          <td>{{ data['avg_user_read_time'] }}</td>
          <td>{{ data['click_share_book_count'] }}</td>
          <td>{{ data['click_buy_book_count'] }}</td>
          <td>{{ data['average_review'] }} / {{ data['review_count'] }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
export default {
  name: 'EventCountData',
  props: ['title', 'datas'],
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
