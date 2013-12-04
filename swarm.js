var agents = new Array();
var mousePosition = new vector(0,0);
var AGENT_COUNT = 100;

var SPEED_LIMIT = 5;
var ACCEL_LIMIT = 0.25;
var NEIGHBOUR_RADIUS = 100;

var STEER_AVOID_NEIGHBOUR_STRENGTH = 1; //relative strengths
var STEER_JOIN_NEIGHBOUR_STRENGTH = 1;
var STEER_CONVERGE_DIRECTION_STRENGTH = 0.05;
var STEER_AVOID_MOUSE_STRENGTH = 200;
var AVOID_MOUSE_RADIUS_MULTIPLIER = 1; //this * NEIGHBOUR_RADIUS

var TEAM_COLOURS = ["#ff0000","#00ff00"];

function degreesToRadians(angle){
    return Math.PI / 180 * angle;
}


//Draw a triangle at the point. Angle is in radians
function drawTriangle(point, angle, colour, canvas){
    var isocelesAmount = degreesToRadians(20);
    var triangleSize = 7; //from center to the tip
    // Set the style properties.
    canvas.fillStyle = colour;
    canvas.strokeStyle = colour;
    canvas.lineWidth = 1;

    // Start from the top-left point.
    var point1X = point.x + Math.cos(angle) * triangleSize;
    var point1Y = point.y + Math.sin(angle) * triangleSize;
    var point2X = point.x + Math.cos(angle + 2 * Math.PI / 3 + isocelesAmount) * triangleSize;
    var point2Y = point.y + Math.sin(angle + 2 * Math.PI / 3 + isocelesAmount) * triangleSize;
    var point3X = point.x + Math.cos(angle + 4 * Math.PI / 3 - isocelesAmount) * triangleSize;
    var point3Y = point.y + Math.sin(angle + 4 * Math.PI / 3 - isocelesAmount) * triangleSize;

    canvas.beginPath();
    canvas.moveTo(point1X,point1Y);
    canvas.lineTo(point2X, point2Y);
    canvas.lineTo(point3X, point3Y);
    canvas.lineTo(point1X, point1Y);

    // Done! Now fill the shape, and draw the stroke.
    // Note: your shape will not be visible until you call any of the two methods.
    canvas.fill();



}

function vector(x,y) {
    this.x = x;
    this.y = y;

    this.getAngle = getAngle;
    function getAngle(){
        return Math.atan2(y, x);
    }

    this.addVector = addVector;
    function addVector(v){
        return new vector(x+ v.x,y+ v.y);
    }

    this.subVector = subVector;
    function subVector(v) {
        return new vector(x - v.x, y - v.y);
    }

    this.magnitude = magnitude;
    function magnitude(){
        return Math.sqrt(x* x+ y* y);
    }

    //Make the vector this length
    this.scaleTo = scaleTo;
    function scaleTo(newLength){
        var oldLength = magnitude();
        return new vector((x/oldLength)* newLength,(y/oldLength)* newLength);
    }

    //Scale by a certain factor
    this.scaleBy = scaleBy;
    function scaleBy(factor){
        return new vector(x * factor, y * factor);
    }

    //If the vector is longer than the limit, cap it
    this.capLength = capLength;
    function capLength(lengthLimit){
        if(magnitude() > lengthLimit){
            return scaleTo(lengthLimit);
        }else{
            return this;
        }
    }

    this.distance = distance;
    function distance(target){
        return target.subVector(this).magnitude();
    }

    //Bounds a vector to a 0,0,w,h box
    this.wrap = wrap;
    function wrap(width,height){
        var newX = x;
        var newY = y;
        //1px border
        if(x < 0) newX = width - 1;
        if(y < 0) newY = height - 1;
        if(x > width) newX = 1;
        if(y > height) newY = 1;
        return new vector(newX, newY);
    }

}

//With an agent array, finds the average vector (getVectorFunction extracts the vector from the agent, so it can be used on position, velocity, accel etc)
function getAverageVector(agentArray,getVectorFunction){
    if (agentArray.length == 0) {
        return false;
    }

    var i = 0;
    var averageVector = new vector(0, 0);
    for (i = 0; i < agentArray.length; i++) {
        averageVector = averageVector.addVector(getVectorFunction(agentArray[i]));
    }
    averageVector = averageVector.scaleBy(1.0 / agentArray.length)//divide it to make it the average
    return averageVector;
}

function getAveragePosition(agentArray) {
    return getAverageVector(agentArray, function (agent) {
        return agent.position;
    });
}

function getAverageVelocity(agentArray) {
    return getAverageVector(agentArray, function (agent) {
        return agent.velocity;
    });
}

function agent(x,y,id, team) {
    var initialSpeedX = Math.random() * 6 - 3;
    var initialSpeedY = Math.random() * 6 - 3;

    this.position = new vector(x,y);
    this.velocity = new vector(initialSpeedX, initialSpeedY);
    this.acceleration = new vector(0,0);
    this.id = id;
    this.team = team;

    //Agent logic
    this.iterate = iterate;
    function iterate(width,height){
        //Agent AI
        this.avoidNeighbours();
        this.joinNeighbours();
        this.convergeDirection();
        this.avoidMouse();

        //Acceleration and velocity
        this.applyAccelerationlimit();
        this.velocity = this.velocity.addVector(this.acceleration);

        this.applySpeedLimit();
        this.position = this.position.addVector(this.velocity);

        //Make sure we're always in the window
        this.position = this.position.wrap(width,height);
    }

    /*
    Communication
     */
     this.getNeighbours = getNeighbours;
    function getNeighbours() {
        var i = 0;
        var neighbours = new Array();
        for (i = 0; i < agents.length; i++) {
            if (agents[i].id == this.id) continue; //skip ourselves

            //skip wildly different ones
            var positionDifference = agents[i].position.subVector(this.position);
            if(Math.abs(positionDifference.x) > NEIGHBOUR_RADIUS) continue;
            if (Math.abs(positionDifference.y) > NEIGHBOUR_RADIUS) continue;

            var agentPosition = agents[i].position;
            var radiusSquared = Math.pow(NEIGHBOUR_RADIUS, 2);
            var distanceSquared = Math.pow(agentPosition.x - this.position.x, 2) + Math.pow(agentPosition.y - this.position.y, 2);

            //don't sqrt to save time
            if (distanceSquared < radiusSquared) {
                neighbours.push(agents[i]);
            }
        }
        return neighbours;
    }


    /*
    Movement
     */
     //Start heading towards a point
     this.steerTowards = steerTowards;
     function steerTowards(target, strength){
        var changeInAcceleration = target.subVector(this.position).scaleBy(strength);
        this.acceleration = this.acceleration.addVector(changeInAcceleration);
     }

     this.steerAway = steerAway;
     function steerAway(target, strength){
        //less strength for targets that are further away, more for close ones
        var closeness = 1 - target.distance(this.position) / NEIGHBOUR_RADIUS; //1 = max closeness, 0 = radius edge

        var changeInAcceleration = target.subVector(this.position).scaleBy(-strength * closeness);
        this.acceleration = this.acceleration.addVector(changeInAcceleration);
     }

     //Called before moving position
     this.applySpeedLimit = applySpeedLimit;
     function applySpeedLimit(){
        this.velocity = this.velocity.capLength(SPEED_LIMIT);
     }

     //Called before changing velocity
     this.applyAccelerationlimit = applyAccelerationLimit;
     function applyAccelerationLimit(){
        this.acceleration = this.acceleration.capLength(ACCEL_LIMIT);
     }

     //Avoid neighbours (individually)
     this.avoidNeighbours = avoidNeighbours;
     function avoidNeighbours(){
        var neighbours = this.getNeighbours();

        if(neighbours.length == 0) return; //we don't have any neighbours to avoid

        for(var i = 0; i < neighbours.length; i++){
            this.steerAway(neighbours[i].position,STEER_AVOID_NEIGHBOUR_STRENGTH);
        }
     }

    //Cohesion with neighbours.
    this.joinNeighbours = joinNeighbours;
    function joinNeighbours()
    {
        var neighbours = this.getNeighbours();
        if (neighbours.length == 0) return; //we don't have any neighbours to join

        var neighboursAveragePosition = getAveragePosition(neighbours);
        this.steerTowards(neighboursAveragePosition, STEER_JOIN_NEIGHBOUR_STRENGTH);
    }

    //Go towards average direction
    this.convergeDirection = convergeDirection;
    function convergeDirection(){
        var neighbours = this.getNeighbours();
        if (neighbours.length == 0) return; //we don't have any neighbours to converge with
        var neighboursAverageVelocity = getAverageVelocity(neighbours);
        this.velocity = this.velocity.addVector(neighboursAverageVelocity.scaleBy(STEER_CONVERGE_DIRECTION_STRENGTH));

    }

    this.avoidMouse = avoidMouse;
    function avoidMouse(){
        if(mousePosition.distance(this.position) < NEIGHBOUR_RADIUS * AVOID_MOUSE_RADIUS_MULTIPLIER){
            this.steerTowards(mousePosition,-STEER_AVOID_MOUSE_STRENGTH);
        }
    }

    this.alliedAgent = alliedAgent;
    function alliedAgent(agent){
        return teanm == agent.team;
    }





    /*
    Draw
     */
    this.draw = draw;
    function draw(canvas){
        drawTriangle(this.position, this.velocity.getAngle(),TEAM_COLOURS[team], canvas);
    }

    agents.push(this); //add to the agents global array
}

//The main loop of the application
function loop(canvas,canvasElement){

    //Clear the canvas
    canvas.fillStyle = "#ffffff";
    canvas.fillRect(0, 0, canvasElement.width, canvasElement.height);

    //test
    //Iterate every agent
    for (var i = 0; i < agents.length; i++) {
        agents[i].iterate(canvasElement.width,canvasElement.height);
        agents[i].draw(canvas);
    }




}

/*
Mouse interaction
 */
function getMousePos( evt) {
    return new vector(evt.clientX,evt.clientY);
}

function mouseMoveEvent(evt){
    mousePosition = getMousePos( evt);
}

function init(){
    var canvasElement = document.getElementById("swarm-canvas");
    var canvas = canvasElement.getContext("2d");

    //Get canvas properties
    var canvasWidth = document.body.clientWidth;
    var canvasHeight = document.body.clientHeight;

    //set up canvas size
    canvasElement.width = canvasWidth;
    canvasElement.height = canvasHeight;

    //Create an agent
    var i = 0;
    for(i = 0; i < AGENT_COUNT; i++){
        new agent(Math.random() * canvasWidth, Math.random() * canvasHeight,i, i%2);

    }

    //Mouse movement for the canvas
    canvasElement.addEventListener('mousemove', mouseMoveEvent, false);


    setInterval(function() {loop(canvas,canvasElement);},1000/30);
}

init();