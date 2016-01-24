var imgsrc = require("./img-src.js")

module.exports = function(index) {
  var image = new Image()
      image.src = imgsrc[index]
  return image
}