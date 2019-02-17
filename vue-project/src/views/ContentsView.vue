<template>
  <div>
    <!-- <section class="section">
      <breadcrumb>
        <breadcrumb-item label="Home" to="#/"></breadcrumb-item>
        <breadcrumb-item :label="newz.title" to="#/" disable></breadcrumb-item>
      </breadcrumb>
    </section> -->
    <section class="section">
      <div class="container">
        <div class="columns" v-for="content in newz.contents" :key="content">
          <div class="column" v-html="content">
          </div>
          <div>
            <!-- <InArticleAdsense
              data-ad-client="ca-pub-1514313371293640"
              data-ad-slot="2960134284">
            </InArticleAdsense> -->
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore } from '../main'

export default {
  name: 'ListView',
  firestore () {
    return {
      newz: firestore.collection('newz').doc(this.$route.params.key)
    }
  },
  computed: {

  },
  mounted () {

  },
  data () {
    return {
      key: this.$route.params.key
    }
  },
  methods: {
    // getCurrentRoute: () => {
    //   return `/#/contents/${this.key}`
    // },
    test: () => {
      console.log('test')
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.column {
  text-align: left;
  font-size: 16px;
}
.section {
  padding: 10px 5px;
  text-align: left;
}
</style>
