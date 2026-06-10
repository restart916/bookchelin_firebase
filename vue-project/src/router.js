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
import EditLogSelectView from './views/EditLogSelectView';
import EditReviewView from './views/EditReviewView';
import BookExport from './views/BookExport';
import EpubViewer from './views/EpubViewer';

import PublisherLogin from './views/PublisherLogin';
import EventCountViewByPublisher from './views/EventCountViewByPublisher';
import LoginView from './views/LoginView';

import { onAuthReady, isAdmin } from './admin_auth';

Vue.use(Router);

// 인증 없이 접근 가능한 라우트.
//  - LoginView: 로그인 화면
//  - PublisherLogin / EventCountViewByPublisher: 외부 CP사(출판사) 제공용
//  - EpubViewer: 모바일 앱(iOS/Android)이 WebView 로 띄우는 EPUB 리더 — 절대 막으면 안 됨
const PUBLIC_ROUTE_NAMES = ['LoginView', 'PublisherLogin', 'EventCountViewByPublisher', 'EpubViewer'];

const router = new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/login',
      name: 'LoginView',
      component: LoginView
    },
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
      path: '/edit-log-select',
      name: 'EditLogSelectView',
      component: EditLogSelectView
    },
    {
      path: '/edit-review',
      name: 'EditReviewView',
      component: EditReviewView
    },
    {
      path: '/publisher',
      name: 'PublisherLogin',
      component: PublisherLogin
    },
    {
      path: '/publisher/detail/:publisher_id',
      name: 'EventCountViewByPublisher',
      component: EventCountViewByPublisher
    },
    {
      path: '/export',
      name: 'BookExport',
      component: BookExport
    },
    {
      path: '/epub-viewer/:book_id',
      name: 'EpubViewer',
      component: EpubViewer
    },
  ]
});

// 어드민 라우트 접근 가드: 공개 라우트가 아니면 화이트리스트 구글 계정만 통과.
router.beforeEach(async (to, from, next) => {
  if (PUBLIC_ROUTE_NAMES.includes(to.name)) {
    return next();
  }
  const user = await onAuthReady();
  if (isAdmin(user)) {
    return next();
  }
  return next({ name: 'LoginView', query: { redirect: to.fullPath } });
});

export default router;
