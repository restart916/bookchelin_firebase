<template>
  <div>
    <Header></Header>
    <section class='section'>

    </section>
    <section class='section'>
      <div class='container'>
        <div class='columns' v-for='review in reviews' :key="review['.key']">
          <div class='notification card'>
            <div>
              <h1>{{ review.book_id }}</h1>
              {{ review.rating }}<br>
              {{ review.review }}<br>
              {{ review.user_name }}<br>
              {{ review.is_hide }}<br>
            </div>
            <div class='button' @click="updateHideReview(review['.key'])">숨기기</div>
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
      reviews: firestore.collection('book_reviews'),
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
    }
  },
  methods: {
    clearInput() {
    },
    addLinkSelect () {
      let data = {
        image_url: this.image_url,
        link_url: this.link_url,
        title: this.title,
        description: this.description,
      }

      if (this.review_id) {
        firestore.collection('review').doc(this.review_id).update(data).then((docRef) => {
          console.log('update review')
          alert('수정 성공')
          this.clearInput()
        }).catch((error) => {
          console.error('Error adding document: ', error)
          alert('수정 실패')
        })
      } else {
        firestore.collection('review').add(data).then((docRef) => {
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
      for (let review of this.reviews) {
        if (review['.key'] == key) {
          console.log(review)
          this.review_id = review['.key']
          this.link_url = review['link_url']
          this.image_url = review['image_url']
          this.title = review['title'],
          this.description = review['description']
        }
      }
    },
    deleteLinkSelect (key) {
      firestore.collection('review').doc(key).delete().then(() => {
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
