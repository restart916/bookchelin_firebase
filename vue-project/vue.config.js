module.exports = {
  outputDir: '../public',
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
