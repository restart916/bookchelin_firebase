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
        <div>image_file</div>
        <div class='control'>
          <input type='file' class='input' @change='onChangeFile'>
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
      <div>
        <div class='button' @click='addLinkSelect'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='link_select in link_selects' :key="link_select['.key']">
          <div class='notification'>
            <div>
              <h1>{{ link_select.link_url }}</h1>
              <img :src='link_select.image_url' style="height: 80px"/>
            </div>
            <div class='button' @click="selectLinkSelect(link_select['.key'])">수정하기</div>
            <div class='button' @click="deleteLinkSelect(link_select['.key'])">삭제</div>
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
  name: 'EditLinkSelectView',
  components: {
    Header
  },
  firestore () {
    return {
      link_selects: firestore.collection('link_select'),
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
      uploadFile: null,
      title: '',
      description: '',
    }
  },
  methods: {
    onChangeFile(event) {
      console.log('changeFile: ', event.target.files)
      this.uploadFile = event.target.files[0]
    },
    clearInput() {
      this.link_select_id = ''
      this.image_url = ''
      this.link_url = ''
      this.uploadFile = null
      this.title = ''
      this.description = ''
    },
    addLinkSelect () {
      if (this.link_select_id) {
        if (this.uploadFile) {
          let filepath = 'link_select_image/'+this.uploadFile.name
          let upload_ref = firestorage.ref().child(filepath)
          upload_ref.put(this.uploadFile).then(async(snapshot) => {
            console.log('Uploaded file!', snapshot);

            let url = await snapshot.getDownloadURL();

            console.log('Uploaded file url', url);

            let data = {
              image_url: url,
              link_url: this.link_url,
              title: this.title,
              description: this.description,
            }

            firestore.collection('link_select').doc(this.link_select_id).update(data).then((docRef) => {
              console.log('update link_select with file')
              alert('수정 성공')
              this.clearInput()
            }).catch((error) => {
              console.error('Error adding document: ', error)
              alert('수정 실패')
            })
          });
        } else {
          let data = {
            link_url: this.link_url,
            title: this.title,
            description: this.description,
          }

          firestore.collection('link_select').doc(this.link_select_id).update(data).then((docRef) => {
            console.log('update link_select without file')
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

        let filepath = 'link_select_image/'+this.uploadFile.name
        let upload_ref = firestorage.ref().child(filepath)
        upload_ref.put(this.uploadFile).then(async(snapshot) => {
          console.log('Uploaded file!', snapshot);

          let url = await upload_ref.getDownloadURL();

          console.log('Uploaded file url', url);

          let newDocument = {
            image_url: url,
            link_url: this.link_url,
            title: this.title,
            description: this.description,
          }
          firestore.collection('link_select').add(newDocument).then((docRef) => {
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
    selectLinkSelect (key) {
      for (let link_select of this.link_selects) {
        if (link_select['.key'] == key) {
          console.log(link_select)
          this.link_select_id = link_select['.key']
          this.link_url = link_select['link_url']
          this.image_url = link_select['image_url']
          this.title = link_select['title'],
          this.description = link_select['description']
        }
      }
    },
    deleteLinkSelect (key) {
      firestore.collection('link_select').doc(key).delete().then(() => {
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
