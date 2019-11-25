<template>
  <div>
    <div>{{ title }}</div>
    <table>
      <thead>
        <tr>
          <th>이벤트 ID</th>
          <th>책 ID</th>
          <th>책 상세페이지 조회수</th>
          <th>책 바로 읽기 조회수</th>
          <th>책 구매버튼 클릭수</th>
          <th>리뷰평점 / 리뷰 수</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(data, key) in datas">
          <td>{{ key }}</td>
          <td>{{ data['book_id'] }}<br>{{ data['book_name'] }}</td>
          <td>{{ data['show_detail_count'] }}</td>
          <td>{{ data['show_reader_count'] }}</td>
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
