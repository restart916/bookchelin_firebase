<template>
  <div class="login">
    <div class="card">
      <h1>북슐랭 어드민</h1>
      <p class="desc">관리자 구글 계정으로 로그인해 주세요.</p>
      <button class="google-btn" :disabled="loading" @click="login">
        {{ loading ? '로그인 중…' : 'Google 계정으로 로그인' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script>
import { signInWithGoogle, signOut, isAdmin } from '../admin_auth'

export default {
  name: 'LoginView',
  data () {
    return {
      loading: false,
      error: '',
    }
  },
  methods: {
    async login () {
      this.loading = true
      this.error = ''
      try {
        const user = await signInWithGoogle()
        if (!isAdmin(user)) {
          await signOut()
          this.error = `접근 권한이 없는 계정입니다 (${user.email}). 관리자에게 문의하세요.`
          return
        }
        const redirect = this.$route.query.redirect || '/'
        this.$router.replace(redirect)
      } catch (e) {
        // 사용자가 팝업을 닫은 경우 등
        if (e && e.code === 'auth/popup-closed-by-user') {
          this.error = '로그인이 취소되었습니다.'
        } else {
          this.error = '로그인에 실패했습니다. 다시 시도해 주세요.'
          console.error('login error', e)
        }
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.login {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card {
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 40px 36px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  max-width: 360px;
}
h1 {
  font-size: 1.4em;
  margin: 0 0 8px;
  color: #d23669;
}
.desc {
  color: #777;
  margin: 0 0 24px;
  font-size: 0.92em;
}
.google-btn {
  width: 100%;
  padding: 12px 18px;
  border: 1px solid #d23669;
  border-radius: 24px;
  background: #d23669;
  color: #fff;
  font-weight: 700;
  font-size: 0.98em;
  cursor: pointer;
}
.google-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: #c0392b;
  font-size: 0.88em;
  margin-top: 16px;
}
</style>
