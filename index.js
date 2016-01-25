document.title = "NutritionGame"
var fit = require('canvas-fit')
  var canvas = document.body.appendChild(document.createElement('canvas'))
  window.addEventListener('resize', fit(canvas), false)
  var ctx = canvas.getContext('2d')

var audio = new Audio('./audio/songs/gravity.ogg')
    audio.loop = true
    audio.play()

var guyart = require("./art/js/guy.js")
var blockart = require("./art/js/blocks.js")
var itemart = require("./art/js/items.js")

var Level = require('./levels/level1.js')
var level = new Level(blockart, itemart)
  level.makeSky(canvas, 20)
  level.makeGround(3)

var Player = require('./player/player.js')
var player = new Player([0,-64], guyart)
  player.title = true

var keysDown = {}
document.addEventListener("keydown", function(e){
  keysDown[e.keyCode] = true
  e.preventDefault();
})
document.addEventListener('keyup', function(e){
  delete keysDown[e.keyCode]
})

var startTitle = false
var reset = function(){
  level = new Level(blockart, itemart)
  level.makeSky(canvas, 40)
  level.makeGround(100)
  player = new Player([0,-64], guyart)
  startTitle = false
}

function render(){
  ctx.clearRect(0,0, canvas.width, canvas.height)
  ctx.drawImage(blockart.background, 0, 0, canvas.width, canvas.height)

    level.drawClouds(ctx)
    player.drawbars(canvas, ctx)

  ctx.save()
    ctx.translate(-player.pos[0]+canvas.width/4, canvas.height/2)
    level.draw(ctx)
    player.update(canvas, ctx, keysDown, Date.now(), level)
  ctx.restore()

  if (player.end){
    if (!startTitle){
      startTitle = true
      window.setTimeout(reset, 7000)
    }
    player.drawWin(canvas, ctx)
  }
  if (player.dead(canvas)){
    reset()
  }
  window.requestAnimationFrame(render)
}
render()
