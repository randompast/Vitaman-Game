var intersect = require('box-intersect')
function Level(images, items){
    this.images = images
    this.items = items
    this.itemTypes = ["apple", "banana", "brocoli", "candy", "carrot", "chocolate", "icecream", "orange", "strawberry", "water", "watermelon"]
    this.size = 64
    this.ground = [[0,0,64,64]]
    this.groundDirt = []
    this.sky = []
    this.foods = []
    this.foodsNames = []
}

Level.prototype.draw = function(ctx){
    for (var i = 0; i < this.foods.length; i++){
        this.foods[i][1] += this.animate()
        this.foods[i][3] += this.animate()
    }
    for (var i = 0; i < this.ground.length; i++){
        ctx.drawImage( this.images["earthGRASS"], this.ground[i][0], this.ground[i][1], this.ground[i][2] - this.ground[i][0], this.ground[i][3] - this.ground[i][1] )
    }
    for (var i = 0; i < this.groundDirt.length; i++){
        ctx.drawImage( this.images["earth"], this.groundDirt[i][0], this.groundDirt[i][1], this.groundDirt[i][2] - this.groundDirt[i][0], this.groundDirt[i][3] - this.groundDirt[i][1] )
    }
    for (var i = 0; i < this.foods.length; i++){
        ctx.drawImage( this.items[this.foodsNames[i]], this.foods[i][0], this.foods[i][1], this.foods[i][2] - this.foods[i][0], this.foods[i][3] - this.foods[i][1] )
    }
    var i = this.ground.length - 1
    ctx.drawImage( this.images.flag, this.ground[i][0], this.ground[i][1]-this.size, this.ground[i][2] - this.ground[i][0], this.ground[i][3] - this.ground[i][1])
}

Level.prototype.animate = function(){
    return 0.1*Math.cos(performance.now()/200)
}

Level.prototype.drawClouds = function(ctx){
    for (var i = 0; i < this.sky.length; i++){
        ctx.drawImage( this.images["clouds"], this.sky[i][0], this.sky[i][1], this.sky[i][2] - this.sky[i][0], this.sky[i][3] - this.sky[i][1] )
    }
}

Level.prototype.makeCloud = function(canvas){
    var s = Math.floor(Math.random()*128+64)
    var rx1 = Math.floor(Math.random()*(canvas.width-s))
    var rx2 = rx1 + s
    var ry1 = Math.floor(Math.random()*(canvas.height-s))
    var ry2 = ry1 + s
    var arr = [rx1, ry1, rx2, ry2]
    return intersect(this.sky, [arr]).length > 0 ? this.makeCloud(canvas) : arr
}

Level.prototype.makeGround = function(n){
    var arr = []
    for(var i = 0; i < n; i++){
        arr[i] = Math.random() < 0.2 ? 0 : 1
        if(arr[i] == 0){
            arr[i+1] = 1
            i++
        }
    }
    
    for(var i = 1; i < arr.length; i++){
        if (arr[i] === 1){
            this.ground.push([i*this.size, 0,  (i+1)*this.size, this.size])
            if(Math.random() < 0.4 && i < arr.length - 2){
                this.foods.push([i*this.size+this.size*1/4, -this.size+this.size*2/4,  (i+1)*this.size - this.size*1/4, 0])
                this.foodsNames.push(this.itemTypes[Math.floor(Math.random()*this.itemTypes.length)])
            }
            if(Math.random() < 0.4){
                this.groundDirt.push([i*this.size, this.size,  (i+1)*this.size, this.size*2])
                if(Math.random() < 0.4)
                    this.groundDirt.push([i*this.size, this.size*2,  (i+1)*this.size, this.size*3])
            }
        }
    }
}

Level.prototype.makeSky = function(canvas, n){
    for (var i = 0; i < n; i++){
        this.sky.push(this.makeCloud(canvas))
    }
}

Level.prototype.collision = function(box){
    return intersect(this.ground, [box]).length > 0
}

Level.prototype.collection = function(box){
    for (var i = 0; i < this.foods.length; i++) {
        if(intersect([this.foods[i]], [box]).length > 0){
            this.foods.splice(i, 1)
            return this.foodsNames.splice(i, 1)
        }
    }
}

Level.prototype.victory = function(box){
    return intersect([this.ground[this.ground.length-1]], [box]).length > 0
}

module.exports = Level