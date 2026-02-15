let balls = [];
const numBalls = 25;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  
  // Create balls with random properties
  for (let i = 0; i < numBalls; i++) {
    balls.push({
      x: random(width),
      y: random(height),
      vx: random(-4, 4),
      vy: random(-4, 4),
      radius: random(15, 40),
      hue: random(360),
      saturation: random(60, 100),
      brightness: random(80, 100)
    });
  }
}

function draw() {
  background(10, 10, 15, 15); // Trail effect
  
  // Update and draw each ball
  for (let ball of balls) {
    // Update position
    ball.x += ball.vx;
    ball.y += ball.vy;
    
    // Bounce off edges
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > width) {
      ball.vx *= -1;
      ball.x = constrain(ball.x, ball.radius, width - ball.radius);
    }
    if (ball.y - ball.radius < 0 || ball.y + ball.radius > height) {
      ball.vy *= -1;
      ball.y = constrain(ball.y, ball.radius, height - ball.radius);
    }
    
    // Draw ball with glow effect
    drawingContext.shadowBlur = 20;
    drawingContext.shadowColor = color(ball.hue, ball.saturation, ball.brightness, 80);
    
    fill(ball.hue, ball.saturation, ball.brightness);
    noStroke();
    circle(ball.x, ball.y, ball.radius * 2);
    
    // Inner highlight
    fill(ball.hue, ball.saturation - 20, 100, 60);
    circle(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.6);
    
    drawingContext.shadowBlur = 0;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function mousePressed() {
  // Add a new ball at mouse position
  balls.push({
    x: mouseX,
    y: mouseY,
    vx: random(-5, 5),
    vy: random(-5, 5),
    radius: random(15, 40),
    hue: random(360),
    saturation: random(60, 100),
    brightness: random(80, 100)
  });
}
