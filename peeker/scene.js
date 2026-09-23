const PEEKER = { x: -1.2, z: 2.5 };
const HOLDER = { x: 3, z: -1.8 };

function peekerZ(time) {
  if (time <= 0) return -2.4 + Math.max(0, Math.min(1, (time + 700) / 700)) * 4.9;
  return PEEKER.z + Math.min(time / 320, 1) * 1.3;
}

function color(hex, factor) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [value >> 16, value >> 8 & 255, value & 255];
  return `rgb(${channels.map(n => Math.min(255, Math.round(n * factor))).join(",")})`;
}

function cameraPoint(point, camera) {
  const dx = point[0] - camera.x;
  const dz = point[2] - camera.z;
  const forward = dx * Math.sin(camera.yaw) + dz * Math.cos(camera.yaw);
  const right = dx * Math.cos(camera.yaw) - dz * Math.sin(camera.yaw);
  return [right, point[1] - camera.y, forward];
}

function clipNear(points) {
  const near = 0.12;
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const aIn = a[2] >= near, bIn = b[2] >= near;
    if (aIn) result.push(a);
    if (aIn !== bIn) {
      const t = (near - a[2]) / (b[2] - a[2]);
      result.push(a.map((value, axis) => value + (b[axis] - value) * t));
    }
  }
  return result;
}

function makeScene(camera, width, height) {
  const faces = [];
  const quad = (points, fill, stroke = null) => {
    const visible = clipNear(points.map(point => cameraPoint(point, camera)));
    if (visible.length < 3) return;
    const focal = height * 0.86;
    const projected = visible.map(([right, up, forward]) =>
      [width / 2 + right / forward * focal, height * .53 - up / forward * focal]);
    faces.push({ points: projected, depth: visible.reduce((n, point) => n + point[2], 0) / visible.length, fill, stroke });
  };
  const box = (x, y, z, w, h, d, base) => {
    const x0 = x - w / 2, x1 = x + w / 2;
    const z0 = z - d / 2, z1 = z + d / 2;
    const y0 = y, y1 = y + h;
    quad([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],color(base,.8));
    quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],color(base,.91));
    quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],color(base,.65));
    quad([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],color(base,1.08));
    quad([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],color(base,1.2));
  };
  const actor = (x, z, base, targetX, targetZ) => {
    const yaw = Math.atan2(targetX - x, targetZ - z);
    const rotated = (localX, localZ) => [x + localX * Math.cos(yaw) + localZ * Math.sin(yaw), z - localX * Math.sin(yaw) + localZ * Math.cos(yaw)];
    const part = (localX, y, localZ, w, h, d, tint) => {
      const x0 = localX - w / 2, x1 = localX + w / 2;
      const z0 = localZ - d / 2, z1 = localZ + d / 2;
      const corners = [[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([px,pz]) => rotated(px,pz));
      const face = (indices, shade) => quad(indices.map(([corner, top]) => [corners[corner][0],y + (top ? h : 0),corners[corner][1]]),color(tint,shade));
      face([[0,0],[1,0],[1,1],[0,1]],.82);
      face([[2,0],[3,0],[3,1],[2,1]],1.12);
      face([[3,0],[0,0],[0,1],[3,1]],.72);
      face([[1,0],[2,0],[2,1],[1,1]],.92);
      face([[0,1],[1,1],[2,1],[3,1]],1.18);
    };
    part(-.18,0,0,.21,.75,.27,base);
    part(.18,0,0,.21,.75,.27,base);
    part(0,.76,0,.65,.84,.35,base);
    part(-.42,.86,.02,.17,.69,.24,base);
    part(.42,.86,.02,.17,.69,.24,base);
    part(0,1.62,0,.4,.36,.34,"#d7d9dd");
    part(0,1.75,.195,.43,.13,.055,"#273748");
    part(0,1.15,.205,.33,.12,.055,"#f7faff");
  };

  for (let x = -6; x < 6; x++) {
    for (let z = -8; z < 6; z++) {
      quad([[x,0,z],[x+1,0,z],[x+1,0,z+1],[x,0,z+1]],
        (x + z) % 2 === 0 ? "#243445" : "#29394a", "#415065");
    }
  }
  box(-6.1,0,-1, .25,3,14.5,"#46586d");
  box(6.1,0,-1, .25,3,14.5,"#46586d");
  box(0,0,-8.2,12.5,3,.25,"#3e5063");
  box(0,0,6.1,12.5,3,.25,"#3e5063");
  box(0,0,-3.05,.5,2.9,8.5,"#637589");
  box(0,2.02,-3.05,.55,.1,8.5,"#9aafc2");
  box(0,.05,1.2,.65,.12,.28,"#f3a15a");
  return { faces, actor, box };
}

function drawWeapon(ctx, width, height, side) {
  const tint = side === "peeker" ? "#9c3642" : "#255b90";
  const glow = side === "peeker" ? "#ee6770" : "#6fbcff";
  const x = width * .56, y = height;
  ctx.fillStyle = "#101b29";
  ctx.beginPath();
  ctx.moveTo(x - 58,y); ctx.lineTo(x - 40,y - 68); ctx.lineTo(x + 14,y - 106);
  ctx.lineTo(x + 67,y - 62); ctx.lineTo(x + 94,y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.moveTo(x - 35,y); ctx.lineTo(x - 16,y - 58); ctx.lineTo(x + 24,y - 77);
  ctx.lineTo(x + 54,y - 43); ctx.lineTo(x + 67,y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = glow;
  ctx.fillRect(x + 12,y - 101,10,34);
  ctx.fillStyle = "#0b111b";
  ctx.fillRect(x + 2,y - 128,30,34);
  ctx.fillStyle = "#bacbd8";
  ctx.fillRect(x + 9,y - 131,16,8);
}

function drawHud(ctx, width, height, side, shooting, down) {
  ctx.save();
  ctx.strokeStyle = down ? "#ff7777" : "rgba(238,247,255,.9)";
  ctx.lineWidth = 2;
  const x = width / 2, y = height * .53;
  for (const [x0,y0,x1,y1] of [[-18,0,-7,0],[7,0,18,0],[0,-18,0,-7],[0,7,0,18]]) {
    ctx.beginPath(); ctx.moveTo(x+x0,y+y0); ctx.lineTo(x+x1,y+y1); ctx.stroke();
  }
  drawWeapon(ctx,width,height,side);
  if (shooting) {
    const flashX = width * .56 + 18, flashY = height - 135;
    const gradient = ctx.createRadialGradient(flashX,flashY,2,flashX,flashY,76);
    gradient.addColorStop(0,"rgba(255,250,214,.95)");
    gradient.addColorStop(.22,"rgba(255,190,84,.8)");
    gradient.addColorStop(1,"rgba(255,135,54,0)");
    ctx.fillStyle = gradient; ctx.fillRect(flashX-80,flashY-80,160,160);
  }
  if (down) {
    ctx.fillStyle = "rgba(95,20,31,.38)"; ctx.fillRect(0,0,width,height);
  }
  ctx.restore();
}

export class View3D {
  constructor(canvas, side) {
    this.canvas = canvas;
    this.side = side;
    this.context = canvas.getContext("2d", { alpha: false });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.lastModel) this.render(this.lastTime,this.lastModel);
    }
  }

  render(time, model) {
    this.lastTime = time;
    this.lastModel = model;
    const width = this.canvas.width, height = this.canvas.height;
    const ctx = this.context;
    const sky = ctx.createLinearGradient(0,0,0,height);
    sky.addColorStop(0,"#101d2e"); sky.addColorStop(.53,"#26394a"); sky.addColorStop(1,"#293746");
    ctx.fillStyle = sky; ctx.fillRect(0,0,width,height);
    const side = this.side;
    const camera = side === "peeker"
      ? { x: PEEKER.x, z: peekerZ(time), y: 1.68, yaw: Math.atan2(HOLDER.x - PEEKER.x, HOLDER.z - PEEKER.z) }
      : { x: HOLDER.x, z: HOLDER.z, y: 1.68, yaw: Math.atan2(PEEKER.x - HOLDER.x, PEEKER.z - HOLDER.z) };
    const scene = makeScene(camera,width,height);
    if (side === "peeker") scene.actor(HOLDER.x,HOLDER.z,"#4d9bea",PEEKER.x,peekerZ(time));
    if (side === "holder") scene.actor(PEEKER.x,peekerZ(time - model.holderSees),"#e3505c",HOLDER.x,HOLDER.z);
    scene.faces.sort((a,b) => b.depth - a.depth);
    for (const face of scene.faces) {
      ctx.beginPath(); ctx.moveTo(face.points[0][0],face.points[0][1]);
      for (let i=1;i<face.points.length;i++) ctx.lineTo(face.points[i][0],face.points[i][1]);
      ctx.closePath(); ctx.fillStyle = face.fill; ctx.fill();
      if (face.stroke) { ctx.strokeStyle = face.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }
    const firedAt = side === "peeker" ? model.peekerFires : model.holderFires;
    const deathAt = side === "peeker" ? model.peekerDeathNotice : model.holderDeathNotice;
    const loses = side === "peeker" ? !model.peekerWins && !model.simultaneous : model.peekerWins;
    const down = loses && time >= deathAt;
    const shooting = time >= firedAt && time < firedAt + 90 && (!loses || firedAt < deathAt);
    drawHud(ctx,width,height,side,shooting,down);
  }
}

