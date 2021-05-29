<template>
  <div>
    <Header></Header>
    <section class='section'>
      1. 추가하기 - link_select_id 를 제외한 데이터를 입력하고 add 버튼을 누른다<br>
      2. 삭제하기 - 아래 목록에서 삭제버튼을 누른다<br>
      3. 수정하기 - 아래 목록에서 수정하기 버튼을 누른다. 위에 입력란에 데이터가 채워지면 수정하고 다시 add 버튼을 누른다<br>
      * - 수정하기할때 파일은 추가 안해도 내용만 수정가능합니다<br>
    </section>
    <section class='section'>
      <div>
        <div>link_select_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='link_select_id'>
        </div>
      </div>
      <div>
        <div>image_url</div>
        <div class='control'>
          <input type='text' class='input' v-model='image_url'>
        </div>
      </div>
      <div>
        <div>link_url</div>
        <div class='control'>
          <input type='text' class='input' v-model='link_url'>
        </div>
      </div>
      <div>
        <div>title</div>
        <div class='control'>
          <input type='text' class='input' v-model='title'>
        </div>
      </div>
      <div>
        <div>description</div>
        <div class='control'>
          <textarea type='text' class='input' v-model='description'>
          </textarea>
        </div>
      </div>
      <div class="Column">
        <div>숨김여부 - 체크시 NewMain에서 보이지 않게 됩니다</div>
        <div class='control'>
          <input type="checkbox" id="checkbox" v-model="hidden">
          <label for="checkbox">숨기기</label>
        </div>
      </div>
      <div>
        <div class='button' @click='addLinkSelect'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns'
             v-for='chunk_link_select in chunk_link_selects'
             >
          <div v-for='link_select in chunk_link_select'
               :key="link_select['.key']"
               class="Row">
            <div class='notification Column' :class="{active: !link_select.hidden}">
              <div>
                <h1>{{ link_select.title }}</h1>
                <h2>{{ click_count(link_select['.key']) }}</h2>
                <h2>{{ datetime_string(link_select.timestamp) }}</h2>
                <img :src='link_select.image_url' style="height: 80px"/>
              </div>
              <div class='button' @click="selectLinkSelect(link_select['.key'])">수정하기</div>
              <div class='button' @click="deleteLinkSelect(link_select['.key'])">삭제</div>
              <div v-if="link_select.hidden">
                <div class='button' @click="showLinkSelect(link_select['.key'])">보여주기</div>
              </div>
              <div v-else>
                <div class='button' @click="hideLinkSelect(link_select['.key'])">숨기기</div>
              </div>
              <select v-model="link_select.category" @change="onChangeBookCategory(link_select)">
              <option disabled value="0">선택해주세요</option>
              <option v-for="category in book_category" :key="category.key"
                :value="category.id">
                {{ category.name }}
              </option>
            </select>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firestorage, fireauth } from '../main'
import Header from './components/Header'
import _ from 'lodash'

export default {
  name: 'EditLinkSelectView',
  components: {
    Header
  },
  firestore () {
    return {
      link_selects: firestore.collection('link_select').orderBy('timestamp', 'desc'),
      link_select_click: firestore.collection('link_select_click'),
      book_category: firestore.collection('book_category').orderBy('id', 'desc'),
    }
  },
  mounted () {
    fireauth.signInAnonymously().catch(function(error) {
      // Handle Errors here.
      var errorCode = error.code;
      var errorMessage = error.message;
      console.log('login error', error);
    });
  },
  data () {
    return {
      link_select_id: '',
      image_url: '',
      link_url: '',
      title: '',
      description: '',
      hidden: false,
      link_select_click_by_key: {},
    }
  },
  computed: {
    chunk_link_selects() {
      return _.chunk(this.link_selects, 3)
    }
  },
  methods: {
    clearInput() {
      this.link_select_id = ''
      this.image_url = ''
      this.link_url = ''
      this.title = ''
      this.description = ''
      this.hidden = false
    },
    addLinkSelect () {
      let data = {
        image_url: this.image_url,
        link_url: this.link_url,
        title: this.title,
        description: this.description,
        hidden: this.hidden,
      }

      if (this.link_select_id) {
        firestore.collection('link_select').doc(this.link_select_id).update(data).then((docRef) => {
          console.log('update link_select')
          alert('수정 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('수정 실패')
        })
      } else {
        firestore.collection('link_select').add({
          timestamp: this.$moment().unix(),
          ...data
        }).then((docRef) => {
          console.log('Document written with ID: ', docRef.id)
          alert('추가 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('추가 실패')
        })
      }
    },
    selectLinkSelect (key) {
      for (let link_select of this.link_selects) {
        if (link_select['.key'] == key) {
          console.log(link_select)
          this.link_select_id = link_select['.key']
          this.link_url = link_select['link_url']
          this.image_url = link_select['image_url']
          this.title = link_select['title'],
          this.description = link_select['description']
          this.hidden = 'hidden' in link_select ? link_select['hidden'] : false
        }
      }
    },
    hideLinkSelect (key) {
      this.updateHiddenLinkSelect(key, true)
    },
    showLinkSelect (key) {
      this.updateHiddenLinkSelect(key, false)
    },
    updateHiddenLinkSelect(key, hidden) {
      firestore.collection('link_select').doc(key).update({
        hidden: hidden
      }).then((docRef) => {
        alert('수정 성공')
        this.clearInput()
      }).catch((error) => {
        console.error('Error : ', error)
        alert('수정 실패')
      })
    },
    deleteLinkSelect (key) {
      firestore.collection('link_select').doc(key).delete().then(() => {
        console.log('Document successfully deleted!')
        alert('삭제 성공')
      }).catch((error) => {
        console.error('Error removing document: ', error)
        alert('삭제 실패')
      })
    },
    datetime_string (timestamp) {
      // console.log(timestamp)
      return this.$moment.unix(timestamp).format('YYYY-MM-DD HH:mm:ss')
    },
    click_count(key) {
      // for (let link_select of this.link_selects) {
      //   if (link_select['.key'] == key) {
      //     if (!('timestamp' in link_select)) {
      //       console.log('wow?')
      //       firestore.collection('link_select').doc(key).update({
      //         timestamp: this.$moment().unix(),
      //       }).then((docRef) => {
      //         console.log('successfully tt!')
      //       }).catch((error) => {
      //         console.log('error tt!')
      //       })
      //     }
      //   }
      // }

      if (key in this.link_select_click_by_key) {
        return this.link_select_click_by_key[key]
      }
      let count = 0;

      for (let item of this.link_select_click) {
        if (item.link_select_id == key) {
          count++;
        }
      }
      if (count > 0) {
        this.link_select_click_by_key[key] = count
      }
      return count
    },
    onChangeBookCategory(link_select) {
      console.log('onChangeBookCategory: ', link_select)

      firestore.collection('link_select').doc(link_select['.key']).update({
        category: link_select.category
      }).then((docRef) => {
        alert(`${link_select.title} 수정 성공`)
        this.clearInput()
      }).catch((error) => {
        alert(`${link_select.title} 수정 실패`)
      })

    },
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
.notification {
  width: 400px;                   /* IE6 needs any width */
}
.longLink {
  white-space: nowrap;
  overflow: hidden;              /* "overflow" value must be different from  visible"*/
  -o-text-overflow: ellipsis;
  text-overflow:    ellipsis;
}
.active {
  background-color: #5FDBA7;
}
</style>
