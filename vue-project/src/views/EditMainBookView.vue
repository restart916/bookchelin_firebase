<template>
  <div>
    <Header></Header>
    <section class='section'>
      1. 추가하기 - mainBook_id 를 제외한 데이터를 입력하고 add 버튼을 누른다<br>
      2. 삭제하기 - 아래 목록에서 삭제버튼을 누른다<br>
      3. 수정하기 - 아래 목록에서 수정하기 버튼을 누른다. 위에 입력란에 데이터가 채워지면 수정하고 다시 add 버튼을 누른다<br>
      * - 수정하기할때 파일은 추가 안해도 내용만 수정가능합니다<br>
    </section>
    <section class='section'>
      <div>
        <div>mainBook_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='mainBook_id'>
        </div>
      </div>
      <div>
        <div>image_file</div>
        <div class='control'>
          <input type='file' class='input' @change='onChangeFile'>
        </div>
      </div>
      <div>
        <div>book_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='book_id'>
        </div>
      </div>
      <div>
        <div>순서 - 숫자로 입력하세요</div>
        <div class='control'>
          <input type='text' class='input' v-model='order'>
        </div>
      </div>
      <div>
        <div>숨김여부 - 체크시 앱에서 보이지 않게 됩니다</div>
        <div class='control'>
          <input type="checkbox" id="checkbox" v-model="hidden">
          <label for="checkbox">숨기기</label>
        </div>
      </div>
      <div>
        <div class='button' @click='addBanner'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='mainBook in mainBooks' :key="mainBook['.key']">
          <div class='notification'>
            <div>
              <h1>{{ mainBook.book_id }}</h1>
              <img :src='mainBook.firestore_url' style="height: 80px"/>
            </div>
            <div class='button' @click="selectBanner(mainBook['.key'])">수정하기</div>
            <div class='button' @click="deleteBanner(mainBook['.key'])">삭제</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firestorage, fireauth } from '../main'
import Header from './components/Header'

export default {
  name: 'EditMainBookView',
  components: {
    Header
  },
  firestore () {
    return {
      mainBooks: firestore.collection('main_books').orderBy('order', 'asc'),
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
      mainBook_id: '',
      firestore_url: '',
      book_id: '',
      uploadFile: null,
      order: 0,
      hidden: false
    }
  },
  methods: {
    onChangeFile(event) {
      console.log('changeFile: ', event.target.files)
      this.uploadFile = event.target.files[0]
    },
    clearInput() {
      this.mainBook_id = ''
      this.firestore_url = ''
      this.book_id = ''
      this.uploadFile = null
      this.order = 0
      this.hidden = false
    },
    addBanner () {
      if (this.mainBook_id) {
        if (this.uploadFile) {
          let filepath = 'mainBook_image/'+this.uploadFile.name
          let upload_ref = firestorage.ref().child(filepath)
          upload_ref.put(this.uploadFile).then(async(snapshot) => {
            console.log('Uploaded file!', snapshot);

            let url = await snapshot.getDownloadURL();

            console.log('Uploaded file url', url);

            let data = {
              firestore_url: url,
              book_id: this.book_id,
              order: this.order,
              hidden: this.hidden,
            }

            firestore.collection('main_books').doc(this.mainBook_id).update(data).then((docRef) => {
              console.log('update mainBook with file')
              alert('수정 성공')
              this.clearInput()
            }).catch((error) => {
              console.error('Error adding document: ', error)
              alert('수정 실패')
            })
          });
        } else {
          let data = {
            book_id: this.book_id,
            order: this.order,
            hidden: this.hidden,
          }

          firestore.collection('main_books').doc(this.mainBook_id).update(data).then((docRef) => {
            console.log('update mainBook without file')
            alert('수정 성공')
            this.clearInput()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('수정 실패')
          })
        }

      } else {
        if (this.uploadFile == null) {
          alert('퍄일을 등록해주세요')
          return
        }

        let filepath = 'mainBook_image/'+this.uploadFile.name
        let upload_ref = firestorage.ref().child(filepath)
        upload_ref.put(this.uploadFile).then(async(snapshot) => {
          console.log('Uploaded file!', snapshot);

          let url = await upload_ref.getDownloadURL();

          console.log('Uploaded file url', url);

          let newDocument = {
            firestore_url: url,
            book_id: this.book_id,
            order: this.order,
            hidden: this.hidden,
          }
          firestore.collection('main_books').add(newDocument).then((docRef) => {
            console.log('Document written with ID: ', docRef.id)
            alert('추가 성공')
            this.clearInput()
          }).catch((error) => {
            console.error('Error adding document: ', error)
            alert('추가 실패')
          })
        });
      }
    },
    selectBanner (key) {
      for (let mainBook of this.mainBooks) {
        if (mainBook['.key'] == key) {
          console.log(mainBook)
          this.mainBook_id = mainBook['.key']
          this.book_id = mainBook['book_id']
          this.firestore_url = mainBook['firestore_url']
          this.order = mainBook['order']
          this.hidden = mainBook['hidden']
        }
      }
    },
    deleteBanner (key) {
      firestore.collection('main_books').doc(key).delete().then(() => {
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
