const canvas = document.querySelector("#immune-canvas");
const context = canvas?.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let particles = [];
let frame;
const colors = ["#55d6a5", "#86a9ff", "#ffffff", "#a5ead2"];

const reset = () => {
  if (!canvas || !context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  particles = Array.from({ length: 18 }, (_, index) => ({ x: Math.random()*rect.width, y: Math.random()*rect.height, radius: 8+Math.random()*25, vx: (Math.random()-.5)*.35, vy: (Math.random()-.5)*.35, color: colors[index%colors.length] }));
};

const draw = () => {
  if (!canvas || !context) return;
  const rect = canvas.getBoundingClientRect();
  context.clearRect(0, 0, rect.width, rect.height);
  particles.forEach((particle) => {
    if (!reducedMotion) { particle.x += particle.vx; particle.y += particle.vy; if (particle.x < -particle.radius || particle.x > rect.width+particle.radius) particle.vx *= -1; if (particle.y < -particle.radius || particle.y > rect.height+particle.radius) particle.vy *= -1; }
    context.beginPath(); context.arc(particle.x, particle.y, particle.radius, 0, Math.PI*2); context.fillStyle = particle.color; context.globalAlpha = .62; context.shadowColor = "rgba(25,145,105,.2)"; context.shadowBlur = 18; context.fill();
  });
  context.globalAlpha = 1;
  if (!reducedMotion) frame = requestAnimationFrame(draw);
};

if (canvas && context) { reset(); draw(); window.addEventListener("resize", () => { cancelAnimationFrame(frame); reset(); draw(); }); }

