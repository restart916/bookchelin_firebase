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
import EditTimeEventView from './views/EditTimeEventView';
import EditLimitEventView from './views/EditLimitEventView';
import EditLinkSelectView from './views/EditLinkSelectView';
import EditReviewView from './views/EditReviewView';

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
      path: '/edit-time-event',
      name: 'EditTimeEventView',
      component: EditTimeEventView
    },
    {
      path: '/edit-limit-event',
      name: 'EditLimitEventView',
      component: EditLimitEventView
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
    },
    {
      path: '/edit-link-select',
      name: 'EditLinkSelectView',
      component: EditLinkSelectView
    },
    {
      path: '/edit-review',
      name: 'EditReviewView',
      component: EditReviewView
    }
  ]
});
