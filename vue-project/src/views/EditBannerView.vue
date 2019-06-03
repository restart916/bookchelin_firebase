<template>
  <div>
    <section class='section'>
      1. 추가하기 - banner_id 를 제외한 데이터를 입력하고 add 버튼을 누른다<br>
      2. 삭제하기 - 아래 목록에서 삭제버튼을 누른다<br>
      3. 수정하기 - 아래 목록에서 수정하기 버튼을 누른다. 위에 입력란에 데이터가 채워지면 수정하고 다시 add 버튼을 누른다<br>
      * - 수정하기할때 파일은 추가 안해도 내용만 수정가능합니다<br>
    </section>
    <section class='section'>
      <div>
        <div>banner_id</div>
        <div class='control'>
          <input type='text' class='input' v-model='banner_id'>
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
        <div>순서 - 숫자로 입력하세요</div>
        <div class='control'>
          <input type='text' class='input' v-model='order'>
        </div>
      </div>
      <div>
        <div class='button' @click='addBanner'>Add</div>
      </div>
    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='banner in banners' :key="banner['.key']">
          <div class='notification'>
            <div>
              <h1>{{ banner.link_url }}</h1>
              <img :src='banner.firestore_url' style="height: 80px"/>
            </div>
            <div class='button' @click="selectBanner(banner['.key'])">수정하기</div>
            <div class='button' @click="deleteBanner(banner['.key'])">삭제</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { firestore, firestorage, fireauth } from '../main'

export default {
  name: 'EditBannerView',
  firestore () {
    return {
      banners: firestore.collection('banners').orderBy('order', 'asc'),
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
      banner_id: '',
      firestore_url: '',
      link_url: '',
      uploadFile: null,
      order: 0
    }
  },
  methods: {
    onChangeFile(event) {
      console.log('changeFile: ', event.target.files)
      this.uploadFile = event.target.files[0]
    },
    clearInput() {
      this.banner_id = ''
      this.firestore_url = ''
      this.link_url = ''
      this.uploadFile = null
      this.order = 0
    },
    addBanner () {
      if (this.banner_id) {
        if (this.uploadFile) {
          let filepath = 'banner_image/'+this.uploadFile.name
          let upload_ref = firestorage.ref().child(filepath)
          upload_ref.put(this.uploadFile).then(async(snapshot) => {
            console.log('Uploaded file!', snapshot);

            let url = await snapshot.getDownloadURL();

            console.log('Uploaded file url', url);

            let data = {
              firestore_url: url,
              link_url: this.link_url,
              order: this.order,
            }

            firestore.collection('banners').doc(this.banner_id).update(data).then((docRef) => {
              console.log('update banner with file')
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
            order: this.order,
          }

          firestore.collection('banners').doc(this.banner_id).update(data).then((docRef) => {
            console.log('update banner without file')
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

        let filepath = 'banner_image/'+this.uploadFile.name
        let upload_ref = firestorage.ref().child(filepath)
        upload_ref.put(this.uploadFile).then(async(snapshot) => {
          console.log('Uploaded file!', snapshot);

          let url = await upload_ref.getDownloadURL();

          console.log('Uploaded file url', url);

          let newDocument = {
            firestore_url: url,
            link_url: this.link_url,
            order: this.order,
          }
          firestore.collection('banners').add(newDocument).then((docRef) => {
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
      for (let banner of this.banners) {
        if (banner['.key'] == key) {
          console.log(banner)
          this.banner_id = banner['.key']
          this.link_url = banner['link_url']
          this.firestore_url = banner['firestore_url']
          this.order = banner['order']
        }
      }
    },
    deleteBanner (key) {
      firestore.collection('banners').doc(key).delete().then(() => {
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
