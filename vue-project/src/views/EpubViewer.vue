<template>
  <div>
    <PullToRefresh
      :down="1"
      :up="1"
      :pulldownOffset="100"
      :pullupOffset="100"
      :addNew="addNew"
      :addMore="addMore"
      :hasMore="hasMore"
      :propsLableUp="lableUp"
      :propsLableDown="lableDown"
      ref="pulltorefresh"
      v-show="isShow"
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

    <BottomBar>
      <div class="bottom-bar">
        <button @click="fontSizeDown"> 가- </button>
        <button @click="fontSizeUp"> 가+ </button>
        <button @click="changeThmem('normal')"> 노말 </button>
        <button @click="changeThmem('dark')"> 다크 </button>
        <button @click="marginDown"> 여백- </button>
        <button @click="marginUp"> 여백+ </button>
        <!-- <button @click="changeFlow('scrolled')"> 쭉 </button>
        <button @click="changeFlow('scrolled-doc')"> 챕터 </button> -->
      </div>
    </BottomBar>
  </div>
</template>

<script>
import { fireauth, firestore, firestorage } from '../main'
import PullToRefresh from 'pulltorefresh-vue';
import ePub from 'epubjs'
import BottomBar from "@nagoos/vue-bottom-bar";
import "@nagoos/vue-bottom-bar/dist/vue-bottom-bar.css";

export default {
  name: 'EpubViewer',
  components: {
    PullToRefresh,
    BottomBar
  },
  async mounted () {
    let user = await fireauth.signInAnonymously();
    console.log('fireauth', user)

    let book_id = this.$route.params.book_id;
    let cfi = decodeURI(this.$route.query.cfi || '') || undefined;
    // cfi = "epubcfi(/6/18[ch01-text]!/4/14/1:136)"
    this.cfi = cfi;

    console.log('mounted', book_id, cfi)
    this.message = `mounted ${book_id}, ${cfi}`

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
    this.rendition = this.epubBook.renderTo(this.renderTarget, {
      // manager: "continuous",
      width: "100%",
      // flow:"scrolled"
      flow:"scrolled-doc"
    });
    // let rendition = this.epubBook.renderTo('viewer', { manager: "continuous", width: "100%", flow:"scrolled" });

    // Navigation loaded
    this.epubBook.loaded.navigation.then(function(toc){
      console.log('this.epubBook.loaded.navigation', toc);
    });

    this.initRendition();
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

      isShow: true,
      renderTarget: 'viewer', // document.body
      fontSize: 100,
      sideMargin: 20,
      cfi: undefined,
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
    },
    fontSizeUp() {
      this.fontSize += 10
      this.updateFontSize()
    },
    fontSizeDown() {
      this.fontSize -= 10
      this.updateFontSize()
    },
    updateFontSize() {
      if (this.rendition) {
        this.rendition.themes.default({ "p": { "font-size": `${this.fontSize}% !important`}})
      }
    },
    marginUp() {
      this.sideMargin += 10
      this.updateSideMargin()
    },
    marginDown() {
      this.sideMargin = Math.max(0, this.sideMargin - 10)
      this.updateSideMargin()
      console.log('marginDown');
    },
    updateSideMargin() {
      if (this.rendition) {
        this.rendition.themes.default({ "body": { "padding": `0px ${this.sideMargin}px !important`}})
        console.log('updateSideMargin', this.sideMargin);
      }
    },
    changeThmem(theme) {
      if (this.rendition) {
        this.rendition.themes.select(theme);
        this.rendition.start()
      }
    },
    changeFlow(flow) {
      if (this.rendition) {
        this.rendition.destroy()
        if (flow == 'scrolled') {
          this.rendition = this.epubBook.renderTo(document.body, {
            manager: "continuous",
            width: "100%",
            flow:"scrolled"
          });
          this.isShow = false
        } else {
          this.rendition = this.epubBook.renderTo(this.renderTarget, {
            width: "100%",
            flow:"scrolled-doc"
          });
          this.isShow = true
        }
        this.initRendition()
      }
    },
    initRendition() {
      this.displayed = this.rendition.display(this.cfi);

      this.displayed.then((renderer) => {
        // -- do stuff
        console.log('this.displayed.then');
        this.loading = true;
      });

      this.rendition.on("touchstart", (e) => {
        e.preventDefault();
        // console.log('rendition touchstart', e);
        this.$refs.pulltorefresh.touchStart(e);
      });

      this.rendition.on("touchmove", (e) => {
        e.preventDefault();
        // console.log('rendition touchmove', e);
        this.$refs.pulltorefresh.touchMove(e);
      });

      this.rendition.on("touchend", (e) => {
        e.preventDefault();
        // console.log('rendition touchend', e);
        this.$refs.pulltorefresh.touchEnd(e);
      });

      this.rendition.on("relocated", function(location){
        this.cfi = location.end.cfi;
        console.log('relocated', location, this.cfi);

        if (this.isShow) {
          window.scrollTo(0,0);
        }

        if (window.flutter_webview) {
          window.flutter_webview.postMessage(`relocated:${this.cfi}`);
        }
      });

      this.rendition.on("rendered", function(section){
        // console.log('rendered', section);
        var nextSection = section.next();
        var prevSection = section.prev();

        // if (window.flutter_webview) {
        //   window.flutter_webview.postMessage(`rendered`);
        // }

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

      this.rendition.themes.register(
        "normal",
        {
          "body": { "background-color": "inherit" },
          "html": { "-webkit-filter": "inherit", "filter": "inherit" },
          "img": {
            "-webkit-filter": "inherit",
            "filter": "inherit",
            "max-width": "100% !important;",
            "max-height": "100% !important;"
          }
        }
      );

      this.rendition.themes.register(
        "dark",
        {
          "body": { "background-color": "#111111" },
          "html": { "-webkit-filter": "invert(1) hue-rotate(180deg)", "filter": "invert(1) hue-rotate(180deg)" },
          "img": {
            "-webkit-filter": "invert(1) hue-rotate(180deg)",
            "filter": "invert(1) hue-rotate(180deg)",
            "max-width": "100% !important;",
            "max-height": "100% !important;"
          }
        }
      );

      this.updateSideMargin()
      this.updateFontSize()
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style>
html { height: 100%; overflow:auto; }
body { height: 100%; }

.nav-btn {
  margin: 20px 0px;
}
.viewer {
  margin-top: 50px;
}

.bottom-bar {
  padding: 10px 0px;
  background-color: lightcoral
}
</style>
