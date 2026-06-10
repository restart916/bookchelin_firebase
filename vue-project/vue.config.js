module.exports = {
  // 어드민은 /admin/ 경로로 서빙 (루트는 SEO 랜딩 페이지 — functions/web_book.js)
  publicPath: '/admin/',
  outputDir: '../public/admin',
  css: {
    loaderOptions: {
      sass: {
        implementation: require('sass'),
      },
      scss: {
        implementation: require('sass'),
      },
    },
  },
  pages: {
    index: {
      entry: 'src/main.js',
      // the source template
      template: 'src/index.html',
    }
  }
}
