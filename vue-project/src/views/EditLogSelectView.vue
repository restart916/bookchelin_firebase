<template>
  <div>
    <Header></Header>
    <section class='section'>
      1. 추가하기 - log_select_id 를 제외한 데이터를 입력하고 add 버튼을 누른다<br>
      2. 삭제하기 - 아래 목록에서 삭제버튼을 누른다<br>
      3. 수정하기 - 아래 목록에서 수정하기 버튼을 누른다. 위에 입력란에 데이터가 채워지면 수정하고 다시 add 버튼을 누른다<br>
      * - 수정하기할때 파일은 추가 안해도 내용만 수정가능합니다<br>
    </section>
    <section class='section'>
      <div>
        <div>log_select_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='log_select_id'>
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
        <div>숨김여부 - 체크시 보이지 않게 됩니다</div>
        <div class='control'>
          <input type="checkbox" id="checkbox" v-model="hidden">
          <label for="checkbox">숨기기</label>
        </div>
      </div>
      <div>
        <div class='button' @click='addLogSelect'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='log_select in log_selects' :key="log_select['.key']">
          <div class='notification Column' :class="{active: !log_select.hidden}">
            <div>
              <h1>{{ log_select.title }}</h1>
              <!-- <h2>{{ click_count(log_select['.key']) }}</h2> -->
              <h2>{{ datetime_string(log_select.timestamp) }}</h2>
            </div>
            <div class='button' @click="selectLogSelect(log_select['.key'])">수정하기</div>
            <div class='button' @click="deleteLogSelect(log_select['.key'])">삭제</div>
            <div v-if="log_select.hidden">
              <div class='button' @click="showLogSelect(log_select['.key'])">보여주기</div>
            </div>
            <div v-else>
              <div class='button' @click="hideLogSelect(log_select['.key'])">숨기기</div>
            </div>
            <select v-model="log_select.category" @change="onChangeBookCategory(log_select)">
              <option disabled value="0">선택해주세요</option>
              <option v-for="category in book_category" :key="category.key"
                :value="category.id">
                {{ category.name }}
              </option>
            </select>
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
  name: 'EditLogSelectView',
  components: {
    Header
  },
  firestore () {
    return {
      log_selects: firestore.collection('log_select').orderBy('timestamp', 'desc'),
      log_select_click: firestore.collection('log_select_click'),
      book_category: firestore.collection('book_category').orderBy('id', 'desc'),
    }
  },
  mounted () {
    fireauth.signInAnonymously().catch(function(error) {
      console.log('login error', error);
    });
  },
  data () {
    return {
      log_select_id: '',
      link_url: '',
      title: '',
      description: '',
      hidden: false,
      log_select_click_by_key: {},
    }
  },
  computed: {
    chunk_log_selects() {
      return _.chunk(this.log_selects, 3)
    }
  },
  methods: {
    clearInput() {
      this.log_select_id = ''
      this.link_url = ''
      this.title = ''
      this.description = ''
      this.hidden = false
    },
    addLogSelect () {
      let data = {
        link_url: this.link_url,
        title: this.title,
        description: this.description,
        hidden: this.hidden,
      }

      if (this.log_select_id) {
        firestore.collection('log_select').doc(this.log_select_id).update(data).then((docRef) => {
          console.log('update log_select')
          alert('수정 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('수정 실패')
        })
      } else {
        firestore.collection('log_select').add({
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
    selectLogSelect (key) {
      for (let log_select of this.log_selects) {
        if (log_select['.key'] == key) {
          console.log(log_select)
          this.log_select_id = log_select['.key']
          this.link_url = log_select['link_url']
          this.title = log_select['title'],
          this.description = log_select['description']
          this.hidden = 'hidden' in log_select ? log_select['hidden'] : false
        }
      }
    },
    hideLogSelect (key) {
      this.updateHiddenLogSelect(key, true)
    },
    showLogSelect (key) {
      this.updateHiddenLogSelect(key, false)
    },
    updateHiddenLogSelect(key, hidden) {
      firestore.collection('log_select').doc(key).update({
        hidden: hidden
      }).then((docRef) => {
        alert('수정 성공')
        this.clearInput()
      }).catch((error) => {
        console.error('Error : ', error)
        alert('수정 실패')
      })
    },
    deleteLogSelect (key) {
      firestore.collection('log_select').doc(key).delete().then(() => {
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

      if (key in this.log_select_click_by_key) {
        return this.log_select_click_by_key[key]
      }
      let count = 0;

      for (let item of this.log_select_click) {
        if (item.log_select_id == key) {
          count++;
        }
      }
      if (count > 0) {
        this.log_select_click_by_key[key] = count
      }
      return count
    },
    onChangeBookCategory(log_select) {
      console.log('onChangeBookCategory: ', log_select)

      firestore.collection('log_select').doc(log_select['.key']).update({
        category: log_select.category
      }).then((docRef) => {
        alert(`${log_select.title} 수정 성공`)
        this.clearInput()
      }).catch((error) => {
        alert(`${log_select.title} 수정 실패`)
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
