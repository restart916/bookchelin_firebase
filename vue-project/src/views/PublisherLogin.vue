
<template>
  <div>
    <div class="Center">
      <div class="Row Border">
        <div class="Column InputDiv">
          출판사 코드
          <input type='text' v-model="publisher_code"></input>
        </div>
        <div class="Column ButtonDiv">
          <div class='button' @click='login'>로그인 </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { firestore, firestorage } from '../main'


export default {
  name: 'PublisherLogin',
  components: {},
  async mounted () {
    // await this.refreshData();
  },
  data () {
    return {
      publisher_code: '',
    }
  },
  methods: {
    async login() {
      const publisher = await firestore.collection('publisher')
                                   .where('code', '==', this.publisher_code)
                                   .get()

      if (publisher.docs.length > 0) {
        const publisher_id = publisher.docs[0].id;
        this.$router.push({ name: 'EventCountViewByPublisher', params: {publisher_id}})
      } else {
        alert('잘못된 코드입니다. 다시 입력해 주세요.')
      }
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
th {
  min-width: 100px
}
.Border {
  border: solid 1px;
}
.Center {
  text-align: center;
  margin-left: 100px;
}
.Row {
  display: table;

  table-layout: fixed; /*Optional*/
  border-spacing: 10px; /*Optional*/
}
.Column {
  text-align: left;
  display: table-cell;
}
.InputDiv {
  width: 200px;
}
.ButtonDiv {
  width: 60px;
}
</style>
