<template>
  <div>
    <PullToRefresh
      :down="1"
      :up="1"
      :pulldownOffset="100"
      :pullupOffset="100"
      :addNew="gotoPrev"
      :addMore="gotoNext"
      :hasMore="hasMore"
      :propsLableUp="lableUp"
      :propsLableDown="lableDown"
      ref="pulltorefresh"
      v-show="isShow"
      class="root"
      :class="theme"
      @scroll="test"
      >

      <div class="loading" v-if="loading == false">
        <!-- 로딩 중입니다. - {{ message }} -->
        <div class="half-circle-spinner">
          <div class="circle circle-1"></div>
          <div class="circle circle-2"></div>
        </div>
      </div>
      <!-- <div class="nav-btn">
        <a id="prev" href="#prev" class="navlink"></a>
      </div> -->
      <div id="viewer"
           class="viewer"
           :class="loading ? 'view-show' : 'view-hide'"
           ref="viewer"></div>
      <!-- <div class="nav-btn">
        <a id="next" href="#next" class="navlink"></a>
      </div> -->
    </PullToRefresh>

    <BottomBar class="bottom-bar-root">
      <div class="bottom-bar" style="display: flex; justify-content: flex-end; align-items: center;">
        <div class="">
          <a class="bar-menu" @click="fontSizeDown"> 가- </a>
        </div>
        <div class="">
          <a class="bar-menu" @click="fontSizeUp"> 가+ </a>
        </div>
        <div class="" v-if="theme != 'normal'">
          <a class="bar-menu" @click="changeThmem('normal')"> 라이트 </a>
        </div>
        <div class="" v-if="theme != 'dark'">
          <a class="bar-menu" @click="changeThmem('dark')"> 다크 </a>
        </div>
        <div class="">
          <a class="bar-menu" @click="marginDown"> 여백- </a>
        </div>
        <div class="">
          <a class="bar-menu" @click="marginUp"> 여백+ </a>
        </div>
        <div style="display: inline-flex">
          <a class="bar-menu" @click="showTocModal">
            <div class="btn-toc"></div>
          </a>
        </div>

        <!-- <a class="bar-menu" @click="changeFont('KoPubWorld Dotum_Pro Light')"> 돋움체 </a> -->
        <!-- <a class="bar-menu" @click="changeFont('KoPubWorld Batang_Pro Light')"> 바탕체 </a> -->

        <!-- <img src="@/assets/icon_finder.png" class="btn-toc" /> -->

        <!-- <a class="bar-menu" @click="changeFlow('scrolled')"> 쭉 </a>
        <a class="bar-menu" @click="changeFlow('scrolled-doc')"> 챕터 </a> -->
      </div>
    </BottomBar>

    <div v-if="showModal">
      <PopupModal :toc="toc"
                  :closeBtn="true"
                  @before-close="hideTocModal"
                  @click-chapter="clickChapter">
      </PopupModal>
    </div>


  </div>
</template>

<script>
import { fireauth, firestore, firestorage } from '../main'
import PopupModal from './components/PopupModal'
import PullToRefresh from 'pulltorefresh-vue';
import ePub from 'epubjs'
import BottomBar from "@nagoos/vue-bottom-bar";
import "@nagoos/vue-bottom-bar/dist/vue-bottom-bar.css";
import InlineView from '../../node_modules/epubjs/lib/managers/views/inline'

export default {
  name: 'EpubViewer',
  components: {
    PullToRefresh,
    PopupModal,
    BottomBar
  },
  async mounted () {
    this.$refs.pulltorefresh.hide()

    let user = await fireauth.signInAnonymously();
    console.log('fireauth', user)

    let book_id = this.$route.params.book_id;
    let cfi = decodeURI(this.$route.query.cfi || '') || undefined;
    // cfi = "epubcfi(/6/18[ch01-text]!/4/14/1:136)"
    this.cfi = cfi;

    this.fontSize = +this.$route.query.fontsize || this.fontSize;
    this.sideMargin = +this.$route.query.margin || this.sideMargin;
    this.theme = this.$route.query.theme || this.theme;

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
      flow: "scrolled-doc",
      // view: InlineView,
    });
    // let rendition = this.epubBook.renderTo('viewer', { manager: "continuous", width: "100%", flow:"scrolled" });

    // Navigation loaded
    this.epubBook.loaded.navigation.then((toc) => {
      console.log('this.epubBook.loaded.navigation', toc);
      this.toc = toc.toc
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

      showModal: false,
      toc: [],
      isShow: true,
      renderTarget: 'viewer', // document.body
      fontSize: 100,
      sideMargin: 20,
      cfi: undefined,
      theme: 'normal',

      scrollBody: undefined,
      movePrev: false,
    }
  },
  methods: {
    test(e) {
      this.scrollBody = e.target
    },
    gotoPrev() {
      console.log('gotoPrev');
      this.rendition.prev();
      this.loading = false;
      this.movePrev = true;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 100)
      });
    },
    gotoNext() {
      console.log('gotoNext');
      this.rendition.next();
      this.loading = false;
      this.movePrev = false;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 100)
      });
    },
    hasMore() {
      return true;
    },
    fontSizeUp() {
      this.fontSize += 10
      this.flutterNotify('fontsize', this.fontSize)
      this.updateFontSize()
    },
    fontSizeDown() {
      this.fontSize -= 10
      this.flutterNotify('fontsize', this.fontSize)
      this.updateFontSize()
    },
    updateFontSize() {
      if (this.rendition) {
        this.rendition.themes.default({ "p": { "font-size": `${this.fontSize}% !important`}})
      }
    },
    marginUp() {
      this.sideMargin += 10
      this.flutterNotify('margin', this.sideMargin)
      this.updateSideMargin()
    },
    marginDown() {
      this.sideMargin = Math.max(0, this.sideMargin - 10)
      this.flutterNotify('margin', this.sideMargin)
      this.updateSideMargin()
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

        this.theme = theme;
        this.flutterNotify('theme', this.theme)
      }
    },
    changeFont(fontName) {
      if (this.rendition) {
        this.rendition.themes.default({ "p": { "font-family": `'${fontName}' !important`}})
        // console.log(this.rendition);
        // console.log(this.displayed);
      }
    },
    showTocModal() {
      this.showModal = true;
    },
    hideTocModal() {
      this.showModal = false;
    },
    clickChapter(chapter) {
      console.log('clickChapter', chapter);
      this.rendition.display(chapter.href)
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
        setTimeout(() => {
            this.loading = true;
        }, 200);
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

        var container = document.querySelector("#viewer");
        // console.log(container.scrollTop, container.scrollHeight);
        // container.scrollTop = container.scrollHeight;
        // console.log(this.rendition.location.start.cfi, this.rendition.location.end.cfi);
      });

      this.rendition.on("touchend", (e) => {
        e.preventDefault();
        // console.log('rendition touchend', e);
        this.$refs.pulltorefresh.touchEnd(e);
      });

      this.rendition.on("relocated", (location) => {
        this.cfi = location.end.cfi;
        console.log('relocated', location, this.cfi);
        // this.$refs.pulltorefresh.show()

        this.loading = true;

        if (this.isShow) {
          // window.scrollTo(0,0);
          this.$nextTick(() => {
            if (this.scrollBody) {
              if (this.movePrev) {
                this.scrollBody.scrollTo(0, this.scrollBody.scrollHeight + 270)
              } else {
                this.scrollBody.scrollTo(0, 0)
              }
            }
          });
        }

        this.flutterNotify('relocated', this.cfi)

        this.changeFont('KoPubWorld Batang_Pro Light')
        this.updateFontSize()
        this.updateSideMargin()
      });

      this.rendition.on("rendered", function(section){
        // console.log('rendered', section);
        var nextSection = section.next();
        var prevSection = section.prev();

        // if(nextSection) {
        //   let nextNav = this.epubBook.navigation.get(nextSection.href);
        // }
      });

      this.rendition.themes.register(
        "normal",
        {
          "body": { "background-color": "inherit" },
          "p": { "color": "inherit"},
          // "html": { "-webkit-filter": "inherit", "filter": "inherit" },
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
          "body": { "background-color": "#141414" },
          "p": { "color": "#ffffff"},
          // "html": { "-webkit-filter": "invert(1) hue-rotate(180deg)", "filter": "invert(1) hue-rotate(180deg)" },
          "img": {
            "-webkit-filter": "invert(1) hue-rotate(180deg)",
            "filter": "invert(1) hue-rotate(180deg)",
            "max-width": "100% !important;",
            "max-height": "100% !important;"
          }
        }
      );

      this.changeThmem(this.theme)
    },
    flutterNotify(key, value) {
      if (window.flutter_webview) {
        window.flutter_webview.postMessage(`${key}:${value}`);
      }
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
  padding-top: 90px;
  padding-bottom: 270px;
}

.root.normal {
  background-color: inherit;
}

.root.dark {
  background-color: #141414;
}

.bottom-bar-root {
  padding: 0px !important;
}

.bottom-bar {
  padding: 6px 0px;
  border-top: 1px solid #777;
  background-color: #fff;
  text-align: right;
}

a {
    color: #212121;
}
a:-webkit-any-link {
    color: -webkit-link;
    cursor: pointer;
    text-decoration: underline;
}
a:link, a:visited, a:hover {
  color: #212121;
  text-decoration: none;
}

.bar-menu {
  margin-right: 12px;
}
.btn-toc {
  background-image: url('../assets/icon_finder_2.png');
  width: 30px;
  height: 30px;
  background-size: contain;
}

.loading {
  text-align: -webkit-center;
  margin-top: 200px
}

.view-show {
  opacity: 1;
}

.view-hide {
  opacity: 0;
}


@font-face {
  font-family: "KoPubWorld Batang_Pro Light";
  src: url('./../assets/fonts/KoPubWorld Batang_Pro Light.otf');
}

.half-circle-spinner, .half-circle-spinner * {
  box-sizing: border-box;
}

.half-circle-spinner {
  width: 40px;
  height: 40px;
  border-radius: 100%;
  position: relative;
}

.half-circle-spinner .circle {
  content: "";
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 100%;
  border: calc(30px / 10) solid transparent;
}

.half-circle-spinner .circle.circle-1 {
  border-top-color: #ff1d5e;
  animation: half-circle-spinner-animation 1s infinite;
}

.half-circle-spinner .circle.circle-2 {
  border-bottom-color: #ff1d5e;
  animation: half-circle-spinner-animation 1s infinite alternate;
}

@keyframes half-circle-spinner-animation {
  0% {
    transform: rotate(0deg);

  }
  100%{
    transform: rotate(360deg);
  }
}
</style>
