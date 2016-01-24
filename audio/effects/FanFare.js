var AudioContext = window.AudioContext || window.webkitAudioContext
var AC = new AudioContext()
 
 
var filter = AC.createBiquadFilter() 
filter.connect(AC.destination) 
filter.type = 'lowpass' 
filter.frequency.value = 10000 
 
play(0, 0, 0.1) 
play(0.2, 5, 0.1) 
play(0.32, 10, 1)
 
 
function play (delay, pitch, duration) { 
  var startTime = AC.currentTime + delay 
  var endTime = startTime + duration 
 
 
  var oscillator = AC.createOscillator() 
  oscillator.connect(filter) 
 
 
  oscillator.type = 'sawtooth' 
  oscillator.detune.value = pitch * 100 
 
 
  oscillator.start(startTime) 
  oscillator.stop(endTime) 
} 