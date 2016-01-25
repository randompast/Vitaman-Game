//You should really never do this with the audioContext
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = new AudioContext();
var die = function(){ var input = audioContext.createGain();  var feedback = audioContext.createGain();  var delay = audioContext.createDelay();  ;  var output = audioContext.createGain();  ;  delay.delayTime.value = 0.2;  feedback.gain.value = 0.6;  input.connect(delay);  ;  output.connect(audioContext.destination);  input.connect(output);  input.connect(delay);  delay.connect(feedback);  feedback.connect(delay);  feedback.connect(output);  ;  play(0, -3, 0.05);  play(0.05, 2, 0.05);  play(0.1, 9, 0.05);  play(0.15, 14, 0.05);  play(0.2, 9, 0.05);  play(0.25, 2, 0.05);  play(0.3, -3, 0.05);  play(0.35, 7, 0.05);  play(0.4, 14, 0.05);  play(0.45, 18, 0.05);  play(0.5, 9, 0.05);  play(0.55, 2, 0.05);  ;  function play (startAfter, pitch, duration) {;    var time = audioContext.currentTime + startAfter;  ;    var oscillator = audioContext.createOscillator();    oscillator.connect(input) ;  oscillator.type = 'square';    oscillator.detune.value = pitch * 100;  ;    oscillator.start(time);    oscillator.stop(time + duration);  };};//
var junksound = function(){var filter = audioContext.createBiquadFilter() ;  filter.connect(audioContext.destination) ;  filter.type = 'lowpass' ;  filter.frequency.value = 10000 ;   ;  play(0, 14, 0.12) ;   ;  function play (delay, pitch, duration) { ;    var startTime = audioContext.currentTime + delay ;    var endTime = startTime + duration ;   ;   ;    var oscillator = audioContext.createOscillator() ;    oscillator.connect(filter) ;   ;   ;    oscillator.type = 'sawtooth' ;    oscillator.detune.value = pitch * 100 ;   ;   ;    oscillator.start(startTime) ;    oscillator.stop(endTime) ;  };}
var foodsound = function(){ var filter = audioContext.createBiquadFilter() ;filter.connect(audioContext.destination) ;filter.type = 'lowpass' ;filter.frequency.value = 10000 ; ;play(0, 15, 0.12) ; ;function play (delay, pitch, duration) { ;  var startTime = audioContext.currentTime + delay ;  var endTime = startTime + duration ; ; ;  var oscillator = audioContext.createOscillator() ;  oscillator.connect(filter) ; ; ;  oscillator.type = 'sawtooth' ;  oscillator.detune.value = pitch * 100 ; ; ;  oscillator.start(startTime) ;  oscillator.stop(endTime);} }
var fanfare = function(){ var filter = audioContext.createBiquadFilter() ;filter.connect(audioContext.destination) ;filter.type = 'lowpass' ;filter.frequency.value = 10000 ; ;play(0, 0, 0.1) ;play(0.2, 5, 0.1) ;play(0.32, 10, 1); ; ;function play (delay, pitch, duration) { ;  var startTime = audioContext.currentTime + delay ;  var endTime = startTime + duration ; ; ;  var oscillator = audioContext.createOscillator() ;  oscillator.connect(filter) ; ; ;  oscillator.type = 'sawtooth' ;  oscillator.detune.value = pitch * 100 ; ; ;  oscillator.start(startTime) ;  oscillator.stop(endTime) ;} }
var dangerSound = function(){;  var filter = audioContext.createBiquadFilter() ;  filter.connect(audioContext.destination) ;  filter.type = 'lowpass' ;  filter.frequency.value = 10000 ;   ;  play(0, -5, 0.2) ;  play(0.2, -10, 0.2) ;   ;  function play (delay, pitch, duration) { ;    var startTime = audioContext.currentTime + delay ;    var endTime = startTime + duration ;   ;   ;    var oscillator = audioContext.createOscillator() ;    oscillator.connect(filter) ;   ;   ;    oscillator.type = 'sawtooth' ;    oscillator.detune.value = pitch * 100 ;   ;   ;    oscillator.start(startTime) ;    oscillator.stop(endTime) ;  } ;}

function Player(pos, images){
    this.pos = pos
    this.images = images
    this.image = images.guyr
    this.sizebox = [24,44]
    this.offset = [20,19]
    this.size = 64
    this.dir = "right"
    this.moving = true
    this.lastFrame = Date.now()
    this.speed = 3
    this.jumping = false
    this.jumpHeight = 30
    this.jumptime = this.jumpHeight
    this.health = 1
    this.hydration = 1
    this.craving = 0.002
    this.end = false
    this.dangerSoundDelay = 50
    this.title = false
}

Player.prototype.setImage = function(keysDown, time){
    this.lastFrame = this.lastFrame + 50 < time ? time : this.lastFrame
    var walking = this.lastFrame == time && (keysDown[37] || keysDown[39])
    this.moving = walking ? !this.moving : this.moving

    if(keysDown[37]){
        this.dir = "left"
    } else if (keysDown[39]){
        this.dir = "right"
    }

    if (this.dir === "left"){
        this.image = this.moving && keysDown[37] ? this.images.guywl : this.images.guyl
        this.image = this.jumping ? this.images.guyjl : this.image
    } else if(this.dir === "right"){
        this.image = this.moving && keysDown[39] ? this.images.guywr : this.images.guyr
        this.image = this.jumping ? this.images.guyjr : this.image
    }
}

Player.prototype.tryMove = function(keysDown, level, dx, dy){
    return !level.collision([this.pos[0]+this.offset[0]+dx, this.pos[1]+this.offset[1] + dy,
        this.pos[0]+this.offset[0]+this.sizebox[0]+dx, this.pos[1]+this.offset[1]+this.sizebox[1] + dy])
}

Player.prototype.move = function(keysDown, level){
    if(keysDown[37]){
        this.pos[0] = this.tryMove(keysDown, level, -this.speed, 0) ? this.pos[0] - this.speed : this.pos[0]
    } else if(keysDown[39]){
        this.pos[0] = this.tryMove(keysDown, level, this.speed, 0) ? this.pos[0] + this.speed : this.pos[0]
    }

    if(keysDown[32] && this.jumptime > 0){
        this.jumping = true
        this.pos[1] = this.tryMove(keysDown, level, 0, -this.speed*1.2) ? this.pos[1] - this.speed*1.2 : this.pos[1]
        this.jumptime--
    } else {
        this.jumping = false
        this.jumptime = 0
        if(this.tryMove(keysDown, level, 0, this.speed*1.2)){
            this.pos[1] += this.speed*1.2
        } else {
            this.jumptime = this.jumpHeight
        }
    }
}

Player.prototype.collect = function(level){
    var item = level.collection([this.pos[0]+this.offset[0], this.pos[1]+this.offset[1],
        this.pos[0]+this.offset[0]+this.sizebox[0], this.pos[1]+this.offset[1]+this.sizebox[1]])
    if (item){
        switch(item[0]){
            case "apple" :
            case "banana" :
            case "brocoli" :
            case "carrot" :
            case "orange" :
            case "strawberry" :
            case "watermelon" :
                this.health += 0.2
                this.hydration += 0.1
                foodsound()
                break
            case "water" :
                this.hydration += 0.5
                foodsound()
                break
            case "candy" :
            case "chocolate" :
            case "icecream" :
                this.health -= 0.1
                this.hydration -= 0.2
                junksound()
        }
    }
    this.hydration = Math.max(0, Math.min(this.hydration, 1))
    this.health = Math.max(0, Math.min(this.health, 1))
}

Player.prototype.victory = function(level){
    var dy = 16
    var win = level.victory([this.pos[0] + this.offset[0], this.pos[1] + this.offset[1] + dy,
        this.pos[0] + this.offset[0] + this.sizebox[0], this.pos[1] + this.offset[1] + this.sizebox[1] + dy])
    if (win){
        if (this.end === false ){
            fanfare()
        }
        this.end = true
    }
}

Player.prototype.dead = function(canvas){
    if(this.pos[1] > canvas.height/2 || this.health <= 0){
        die()
        return true
    } else {
        return false
    }
}

Player.prototype.update = function(canvas, ctx, keysDown, time, level){
    this.move(keysDown, level)

    this.setImage(keysDown, time)
    this.draw(canvas, ctx)
    this.collect(level)
    this.victory(level)


    if (!this.title){
        if(this.hydration > 0 && !this.end){
            this.hydration -= this.craving
        }
        if(this.health > 0 && this.hydration <= 0 && !this.end){
            this.health -= this.craving
        }

        if(this.health < 0.5 && this.dangerSoundDelay < 0){
            dangerSound()
            this.dangerSoundDelay = 50
        }
        this.dangerSoundDelay--
    }
}

Player.prototype.draw = function(canvas, ctx){
    ctx.drawImage(this.image, this.pos[0], this.pos[1], this.size, this.size )
    if (this.hydration < 0.5){
        var s = Math.cos(performance.now()/100)
        ctx.drawImage(this.images.sweatright, this.pos[0] + this.size/2 - 40, this.pos[1]  + 20, this.size/4 + 5*s, this.size/4 + 5*s )
        ctx.drawImage(this.images.sweatleft, this.pos[0] + this.size/2 + 20, this.pos[1]  + 20, this.size/4 + 5*s, this.size/4 + 5*s )
    }
}

Player.prototype.drawWin = function(canvas, ctx){
    if(this.end){
        if(!this.title){
            this.win(canvas, ctx, this.images.youwin)
        } else {
            this.win(canvas, ctx, this.images.vitaman)
        }
    }
}

Player.prototype.win = function(canvas, ctx, image){
    ctx.drawImage(image, canvas.width/4+20, canvas.height/4-20, canvas.width/2, canvas.height/2)
}

Player.prototype.drawbars = function(canvas, ctx){
    ctx.fillStyle = "#666"
    ctx.fillRect(canvas.width*2/8+10, 40, 270, 12)
    ctx.fillRect(canvas.width*4/8+10, 40, 270, 12)
    ctx.fillStyle = "#ffaaaa"
    ctx.fillRect(canvas.width*2/8+10, 40, 270*this.health, 12)
    ctx.fillStyle = "#aaaaff"
    ctx.fillRect(canvas.width*4/8+10, 40, 270*this.hydration, 12)
    ctx.drawImage(this.images.health,    canvas.width*4/8, 0, 200*1.5, this.size*1.5)
    ctx.drawImage(this.images.hydration, canvas.width*2/8, 0, 200*1.5, this.size*1.5)
}

module.exports = Player
