var AudioContext = window.AudioContext || window.webkitAudioContext
var AC = new AudioContext()

var audioContext = new AudioContext() 
 
 
var filter = audioContext.createBiquadFilter() 
filter.connect(audioContext.destination) 
filter.type = 'lowpass' 
filter.frequency.value = 10000 
 
play(0, 0, 0.1)
 
function play (delay, pitch, duration) { 
  var startTime = audioContext.currentTime + delay 
  var endTime = startTime + duration 
 
 
  var oscillator = audioContext.createOscillator() 
  oscillator.connect(filter) 
 
 
  oscillator.type = 'sawtooth' 
  oscillator.detune.value = pitch * 100 
 
 
  oscillator.start(startTime) 
  oscillator.stop(endTime) 
} 