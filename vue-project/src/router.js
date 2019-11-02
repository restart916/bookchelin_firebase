import Vue from 'vue';
import Router from 'vue-router';
import ListView from './views/ListView';
import ContentsView from './views/ContentsView';
import EditView from './views/EditView';
import EditBannerView from './views/EditBannerView';
import EditMainBookView from './views/EditMainBookView';
import CountView from './views/CountView';
import CountTimeView from './views/CountTimeView';

Vue.use(Router);

export default new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: 'ListView',
      component: ListView
    },
    {
      path: '/contents/:key',
      name: 'ContentsView',
      component: ContentsView
    },
    {
      path: '/edit',
      name: 'EditView',
      component: EditView
    },
    {
      path: '/edit-banner',
      name: 'EditBannerView',
      component: EditBannerView
    },
    {
      path: '/edit-main-book',
      name: 'EditMainBookView',
      component: EditMainBookView
    },
    {
      path: '/count',
      name: 'CountView',
      component: CountView
    },
    {
      path: '/count_time',
      name: 'CountTimeView',
      component: CountTimeView
    }
  ]
});
