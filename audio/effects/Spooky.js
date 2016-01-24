var AudioContext = window.AudioContext || window.webkitAudioContext
var AC = new AudioContext()

var oscillator = AC.createOscillator()
oscillator.connect(AC.destination)
oscillator.type = 'square'

oscillator.start(AC.currentTime)
oscillator.stop(AC.currentTime + 2)