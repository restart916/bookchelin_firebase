import Vue from 'vue'
import App from './App.vue'

import Vuefire from 'vuefire'
import VueFirestore from 'vue-firestore'
import VueBlu from 'vue-blu'
import 'vue-blu/dist/css/vue-blu.min.css'
import Firebase from 'firebase'
import router from './router'
import { TableComponent, TableColumn } from 'vue-table-component';

Vue.config.productionTip = false

var config = {
  apiKey: "AIzaSyDENkJKpJPBJf25bFFikBjlOyy_RTFgu4M",
  authDomain: "bookchelin.firebaseapp.com",
  databaseURL: "https://bookchelin.firebaseio.com",
  projectId: "bookchelin",
  storageBucket: "bookchelin.appspot.com",
  messagingSenderId: "658686940034"
};

Vue.use(Vuefire)
Vue.use(VueFirestore)
Vue.use(VueBlu)
Vue.component('table-component', TableComponent);
Vue.component('table-column', TableColumn);

let firebase = Firebase.initializeApp(config)
export const firestore = firebase.firestore()
export const firestorage = firebase.storage()

new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
