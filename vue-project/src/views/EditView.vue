<template>
  <div>
    <section class='section'>
      <div>
        <div>title</div>
        <div class='control'>
          <input type='text' class='input' v-model='title'>
        </div>
      </div>
      <div>
        <div>datetime</div>
        <div class='control'>
          <input type='text' class='input' v-model='datetime'>
        </div>
      </div>
      <div>
        <div>contents</div>
        <div class='control' v-for='content in contents' :key='contents.indexOf(content)'>
          <textarea class='textarea' v-model='content.value'>
          </textarea>
        </div>
      </div>
      <div>
        <div class='button' @click='addContent'>+</div>
        <div class='button' @click='removeContent'>-</div>
        <div class='button' @click='addNewz'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='newz in newzes' :key="newz['.key']">
          <div class='notification'>
            <h1 class='title'>{{ newz.title }}</h1>
            <div class='button' @click="deleteNewz(newz['.key'])">삭제</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore } from '../main'

export default {
  name: 'EditView',
  firestore () {
    return {
      newzes: firestore.collection('newz').orderBy('datetime', 'desc')
    }
  },
  mounted () {

  },
  data () {
    return {
      title: '',
      datetime: new Date(),
      contents: [{'value': ''}]
    }
  },
  methods: {
    addContent () {
      this.contents.push({'value': ''})
    },
    removeContent () {
      this.contents.pop()
    },
    addNewz () {
      let newContents = []
      for (let content of this.contents) {
        newContents.push(content.value.replace(/\r?\n/g, '<br />'))
        console.log('newContents', content, content.value, newContents)
      }

      let newDocument = {
        title: this.title,
        datetime: this.datetime,
        contents: newContents
      }
      firestore.collection('newz').add(newDocument).then((docRef) => {
        console.log('Document written with ID: ', docRef.id)
        alert('추가 성공')
      }).catch((error) => {
        console.error('Error adding document: ', error)
        alert('추가 실패')
      })
    },
    deleteNewz (key) {
      firestore.collection('newz').doc(key).delete().then(() => {
        console.log('Document successfully deleted!')
        alert('삭제 성공')
      }).catch((error) => {
        console.error('Error removing document: ', error)
        alert('삭제 실패')
      })
    }
  }
}
</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>

</style>
