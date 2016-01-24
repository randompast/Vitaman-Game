(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var AudioContext = window.AudioContext || window.webkitAudioContext
var AC = new AudioContext()

play(0, 5, 0.01)
play(0.1, 5, 0.01)
play(0.2, 5, 0.01)

function play (delay, pitch, duration) {
  var startTime = AC.currentTime + delay
  var endTime = startTime + duration
   
  var envelope = AC.createGain() 
  envelope.connect(AC.destination) 
  envelope.gain.value = 0 
  envelope.gain.setTargetAtTime(1, startTime, 0.1) 
  envelope.gain.setTargetAtTime(0, endTime, 0.2) 
  
  var oscillator = AC.createOscillator() 
  oscillator.connect(envelope)
  
  oscillator.type = 'sawtooth'
  oscillator.detune.value = pitch * 10

  oscillator.start(startTime)
  oscillator.stop(endTime + 2)
}
},{}]},{},[1]);
