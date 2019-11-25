import Vue from 'vue';
import Router from 'vue-router';
import ListView from './views/ListView';
import EditView from './views/EditView';
import EditBannerView from './views/EditBannerView';
import EditMainBookView from './views/EditMainBookView';
import EditSuggestBookView from './views/EditSuggestBookView';
import CountView from './views/CountView';
import CountTimeView from './views/CountTimeView';
import EventCountView from './views/EventCountView';

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
      path: '/edit-suggest-book',
      name: 'EditSuggestBookView',
      component: EditSuggestBookView
    },
    {
      path: '/count',
      name: 'CountView',
      component: CountView
    },
    {
      path: '/count-time',
      name: 'CountTimeView',
      component: CountTimeView
    },
    {
      path: '/event-count',
      name: 'EventCountView',
      component: EventCountView
    }
  ]
});
