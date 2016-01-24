var AudioContext = window.AudioContext || window.webkitAudioContext
var audioContext = new AudioContext()
var effect1 = require("../effects/effect1.js")
//https://github.com/mmckegg/web-audio-school
for (var i = 0; i < 30; i++) {
  effect1(audioContext, i/2, Math.floor(Math.random()*24) -12, 1/2)
}
