<template>
  <div>
    <!-- <pull-to
      :distance-index="1"
      :top-load-method="gotoPrev"
      :bottom-load-method="gotoNext"
      :top-config="topConfig"
      :bottom-config="bottomConfig"> -->
    <PullToRefresh
      :down="1"
      :up="1"
      :pulldownOffset="100"
      :pullupOffset="100"
      :addNew="addNew"
      :addMore="addMore"
      :hasMore="hasMore"
      :lableUp="lableUp"
      :lableDown="lableDown"
      ref="pulltorefresh"
      >
      <div v-if="loading == false">
        로딩 중입니다. - {{ message }}
      </div>
      <!-- <div class="nav-btn">
        <a id="prev" href="#prev" class="navlink"></a>
      </div> -->
      <div id="viewer"></div>
      <!-- <div class="nav-btn">
        <a id="next" href="#next" class="navlink"></a>
      </div> -->
    </PullToRefresh>
  </div>
</template>

<script>
import { fireauth, firestore, firestorage } from '../main'
// import PullTo from 'vue-pull-to'
import PullToRefresh from 'pulltorefresh-vue';
import ePub from 'epubjs'

export default {
  name: 'EpubViewer',
  components: {
    // PullTo,
    PullToRefresh
  },
  async mounted () {
    let user = await fireauth.signInAnonymously();
    console.log('fireauth', user)

    let book_id = this.$route.params.book_id

    console.log('mounted', book_id)
    this.message = `mounted ${book_id}`

    let book = await firestore.collection('books').doc(book_id).get()
    let firestore_url = book.data().firestore_url;
    console.log('book.firestore_url', firestore_url);
    this.message = `firestore_url`

    var pathReference = firestorage.ref();

    console.log('pathReference', pathReference);
    this.message = `pathReference`

    let path = '';
    try {
      path = await pathReference.child(firestore_url).getDownloadURL();
    } catch(error) {
      this.message = `getDownloadURL error ${error.code}`
      return;
    }

    console.log('path', path);
    this.message = `path`

    this.epubBook = ePub(path);
    let renderTarget = 'viewer'; // document.body
    this.rendition = this.epubBook.renderTo(renderTarget, {
      // manager: "continuous",
      width: "100%",
      // flow:"scrolled"
      flow:"scrolled-doc"
    });
    // let rendition = this.epubBook.renderTo('viewer', { manager: "continuous", width: "100%", flow:"scrolled" });
    this.displayed = this.rendition.display();

    this.displayed.then((renderer) => {
      // -- do stuff
      console.log('this.displayed.then');
      this.loading = true;
    });

    // Navigation loaded
    this.epubBook.loaded.navigation.then(function(toc){
      console.log('this.epubBook.loaded.navigation', toc);
    });

    // var next = document.getElementById("next");
    // next.addEventListener("click", function(e){
    //   this.rendition.next();
    //   e.preventDefault();
    // }, false);
    //
    // var prev = document.getElementById("prev");
    // prev.addEventListener("click", function(e){
    //   this.rendition.prev();
    //   e.preventDefault();
    // }, false);
    this.rendition.on("touchstart", (e) => {
      // console.log('rendition touchstart', e);
      this.$refs.pulltorefresh.touchStart(e);
    });

    this.rendition.on("touchmove", (e) => {
      // console.log('rendition touchmove', e);
      this.$refs.pulltorefresh.touchMove(e);
    });

    this.rendition.on("touchend", (e) => {
      // console.log('rendition touchend', e);
      this.$refs.pulltorefresh.touchEnd(e);
    });

    this.rendition.on("relocated", function(location){
      console.log('relocated', location);
    });

    this.rendition.on("rendered", function(section){
      console.log('rendered', section);
      var nextSection = section.next();
      var prevSection = section.prev();

      window.flutter_webview.postMessage(`rendered`);

      // if(nextSection) {
      //   let nextNav = this.epubBook.navigation.get(nextSection.href);
      //   let nextLabel = "next";
      //
      //   if(nextNav) {
      //     nextLabel = nextNav.label;
      //   }
      //
      //   next.textContent = nextLabel + " »";
      // } else {
      //   next.textContent = "";
      // }
      //
      // if(prevSection) {
      //   let prevNav = this.epubBook.navigation.get(prevSection.href);
      //   let prevLabel = "previous";
      //
      //   if(prevNav) {
      //     prevLabel = prevNav.label;
      //   }
      //
      //   prev.textContent = "« " + prevLabel;
      // } else {
      //   prev.textContent = "";
      // }
    });

    this.message = `end`
  },
  data () {
    return {
      loading: false,
      message: '',
      epubBook: null,
      rendition: null,
      displayed: null,
      lableUp: {
        initial: '아래로 당겨서 이전챕터로가기',
        suspend: '이전챕터로가기',
        loading: '로딩중',
        complete: '로딩완료',
      },
      lableDown: {
        initial: '위로 당겨서 다음챕터로가기',
        suspend: '다음챕터로가기',
        loading: '로딩중',
        complete: '로딩완료',
      },
    }
  },
  methods: {
    test() {
    },
    // gotoPrev(loaded) {
    //   console.log('gotoPrev');
    //   setTimeout(() => {
    //     loaded('done');
    //   }, 1000)
    // },
    // gotoNext(loaded) {
    //   console.log('gotoNext');
    //   setTimeout(() => {
    //     loaded('done');
    //   }, 1000)
    // },
    addNew() {
      console.log('addNew');
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.rendition.prev();
          resolve();
        }, 100)
      });
    },
    addMore() {
      console.log('addMore');
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.rendition.next();
          resolve();
        }, 100)
      });
    },
    hasMore() {
      return true;
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
.nav-btn {
  margin: 20px 0px;
}
.viewer {
  margin-top: 50px;
}
</style>
