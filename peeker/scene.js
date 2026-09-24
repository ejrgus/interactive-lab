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
  // Short sections keep painter ordering stable while the camera moves beside the wall.
  const wallStart = -7.3, wallEnd = 1.2;
  for (let z0 = wallStart; z0 < wallEnd; z0 += .5) {
    const z1 = Math.min(wallEnd,z0 + .515);
    if (camera.x < 0) quad([[-.25,0,z0],[-.25,0,z1],[-.25,2.9,z1],[-.25,2.9,z0]],color("#637589",.65));
    else quad([[.25,0,z0],[.25,0,z1],[.25,2.9,z1],[.25,2.9,z0]],color("#637589",1.08));
    quad([[-.25,2.9,z0],[.25,2.9,z0],[.25,2.9,z1],[-.25,2.9,z1]],color("#637589",1.2));
    if (camera.x < 0) quad([[-.28,2.02,z0],[-.28,2.02,z1],[-.28,2.12,z1],[-.28,2.12,z0]],"#9aafc2");
    else quad([[.28,2.02,z0],[.28,2.02,z1],[.28,2.12,z1],[.28,2.12,z0]],"#9aafc2");
  }
  quad([[-.25,0,wallStart],[.25,0,wallStart],[.25,2.9,wallStart],[-.25,2.9,wallStart]],color("#637589",.8));
  quad([[-.25,0,wallEnd],[.25,0,wallEnd],[.25,2.9,wallEnd],[-.25,2.9,wallEnd]],color("#637589",.91));
  box(0,.05,1.2,.65,.12,.28,"#f3a15a");
  return { faces, actor, box };
}

function drawWeapon(ctx, width, height, side, aimX) {
  const sleeve = side === "peeker" ? "#a83d4b" : "#326da8";
  const sleeveLight = side === "peeker" ? "#da6270" : "#5aa7e9";
  const polygon = (points, fill) => {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ctx.save();
  ctx.scale(width / 500,height / 300);
  ctx.translate((aimX / width - .5) * 500,0);
  // Rear first-person view: the barrel recedes toward the center of the scene.
  polygon([[105,300],[175,265],[208,252],[230,273],[224,300]],"#152330");
  polygon([[118,300],[181,271],[205,261],[220,281],[210,300]],sleeve);
  polygon([[395,300],[325,265],[292,252],[270,273],[276,300]],"#152330");
  polygon([[382,300],[319,271],[295,261],[280,281],[290,300]],sleeve);

  // Grip and hands sit behind the slide, rather than beside the barrel.
  polygon([[220,260],[280,260],[286,300],[214,300]],"#0e1924");
  polygon([[226,272],[274,272],[278,300],[222,300]],"#3d5262");
  polygon([[183,269],[208,249],[232,258],[235,286],[211,296]],"#172533");
  polygon([[191,271],[208,257],[225,267],[224,283],[210,290]],sleeveLight);
  polygon([[317,269],[292,249],[268,258],[265,286],[289,296]],"#172533");
  polygon([[309,271],[292,257],[275,267],[276,283],[290,290]],sleeveLight);

  // The top plane narrows into the distance so the muzzle faces the opponent.
  polygon([[201,248],[230,178],[270,178],[299,248],[295,278],[205,278]],"#101c28");
  polygon([[202,248],[230,178],[238,181],[224,250]],"#41586a");
  polygon([[262,181],[270,178],[298,248],[276,250]],"#263948");
  polygon([[237,181],[263,181],[278,249],[222,249]],"#738798");
  polygon([[240,186],[260,186],[271,239],[229,239]],"#536879");
  polygon([[239,212],[261,212],[266,230],[234,230]],"#263846");
  polygon([[242,215],[258,215],[261,220],[239,220]],"#91a3af");
  polygon([[202,249],[298,249],[295,278],[205,278]],"#283b4b");
  polygon([[210,253],[290,253],[288,258],[212,258]],"#738798");
  polygon([[241,266],[259,266],[258,270],[242,270]],"#566c7d");

  // Front and rear sights share the same center line.
  polygon([[245,167],[255,167],[257,185],[243,185]],"#0a141d");
  polygon([[248,171],[252,171],[252,177],[248,177]],"#a5b9c6");
  polygon([[207,236],[230,236],[232,254],[204,254]],"#101a25");
  polygon([[270,236],[293,236],[296,254],[268,254]],"#101a25");
  polygon([[209,238],[225,238],[226,242],[208,242]],"#6b7e8d");
  polygon([[275,238],[291,238],[292,242],[274,242]],"#6b7e8d");
  ctx.restore();
}

function drawHud(ctx, width, height, side, shooting, down, aimX) {
  ctx.save();
  drawWeapon(ctx,width,height,side,aimX);
  if (shooting) {
    const flashX = aimX, flashY = height * .57;
    const gradient = ctx.createRadialGradient(flashX,flashY,2,flashX,flashY,52);
    gradient.addColorStop(0,"rgba(255,250,214,.95)");
    gradient.addColorStop(.22,"rgba(255,190,84,.8)");
    gradient.addColorStop(1,"rgba(255,135,54,0)");
    ctx.fillStyle = gradient; ctx.fillRect(flashX-54,flashY-54,108,108);
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
    const target = side === "peeker"
      ? [HOLDER.x,1.2,HOLDER.z]
      : [PEEKER.x,1.2,peekerZ(time - model.holderSees)];
    const [targetRight,,targetForward] = cameraPoint(target,camera);
    const seesTarget = side === "peeker" ? time >= 0 : time >= model.holderSees;
    const targetX = width / 2 + targetRight / Math.max(.12,targetForward) * height * .86;
    const aimX = seesTarget ? Math.max(width * .12,Math.min(width * .88,targetX)) : width / 2;
    drawHud(ctx,width,height,side,shooting,down,aimX);
  }
}




