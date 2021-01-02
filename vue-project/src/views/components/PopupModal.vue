<template>
  <div>
    <transition name="fade">
      <div class="overlay" v-if="modalVisible" @click.self="toggleModal(); beforeClose()">
        <button class="close" v-if="closeBtn" @click.stop="toggleModal(); beforeClose()">
          <i class="fa fa-close"></i>
        </button>
        <div class="modal" v-if="modalVisible">
          <div v-for="chapter in toc">
            <div class="chapter" @click="clickChapter(chapter)">
              {{ chapter.label }}
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script scoped>
export default {
  data() {
    return {
      modalVisible: false,
    };
  },
  name: "PopupModal",
  components: {
  },
  props: {
    toc: Array,
    btnText: String,
    modalContent: String,
    closeBtn: Boolean,
    showNav: Boolean,
  },
  mounted() {
    this.toggleModal()
  },
  methods: {
    beforeOpen() {
      this.$emit("before-open");
    },
    beforeClose() {
      console.log('beforeClose')
      this.$emit("before-close");
    },
    toggleModal() {
      this.modalVisible = !this.modalVisible;
    },
    onItemLoad() {

    },
    clickChapter(chapter) {
      this.$emit('click-chapter', chapter)
      this.toggleModal()
      this.beforeClose()
    },
  }
};
</script>

<style scoped>
.notice-text {
  display: inline-block;
  padding-left: 10px;
  padding-right: 10px;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  margin-top: 6px;
  margin-bottom: 6px;
}

.overlay {
  background-color: rgba(0, 0, 0, 0.8);
  height: 100%;
  width: 100%;
  position: fixed;
  float: right;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  z-index: 9999;
}
.close {
  background-color: rgb(0, 0, 0);
  font-size: 42px;
  border: 0px;
  text-shadow: none;
  position: fixed;
  z-index: 10000;
  display: block;
  top: 16px;
  right: 16px;
  opacity: 0.4;
  color: white;
}
.content {
  background-color: rgb(255, 255, 255);
}
.modal {
  display: block;
  margin-top: 70px;
}
/* //Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}

.chapter {
  margin-top: 10px;
  color: white;
}
</style>
