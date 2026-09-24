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

function drawWeapon(ctx, width, height, side) {
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
  // Two hands hold a compact side-profile pistol, leaving the sight line clear.
  polygon([[331,300],[349,271],[370,247],[390,258],[379,300]],"#172431");
  polygon([[342,300],[359,270],[375,258],[389,267],[373,300]],sleeve);
  polygon([[416,300],[423,271],[449,253],[500,273],[500,300]],"#172431");
  polygon([[430,300],[435,275],[455,264],[500,284],[500,300]],sleeve);

  // The slide and barrel form the short horizontal stroke of the pistol.
  polygon([[281,190],[302,190],[304,211],[281,207]],"#0c151e");
  polygon([[282,192],[290,193],[290,203],[282,202]],"#687b8b");
  polygon([[297,181],[405,202],[429,219],[432,240],[301,212],[295,204]],"#121d28");
  polygon([[301,184],[403,205],[423,219],[310,197]],"#899aa7");
  polygon([[301,197],[425,222],[428,235],[303,209]],"#3b4e5d");
  polygon([[384,205],[405,209],[414,224],[389,217]],"#1c2c39");
  for (let i = 0; i < 3; i++) {
    const x = 395 + i * 7;
    polygon([[x,211+i*1.4],[x+3,212+i*1.4],[x+6,224+i*1.4],[x+3,223+i*1.4]],"#0e1822");
  }
  polygon([[301,178],[306,179],[306,186],[300,184]],"#0e1822");
  polygon([[397,193],[414,197],[415,204],[396,200]],"#0e1822");

  // Frame, trigger guard and angled magazine grip form the vertical stroke.
  polygon([[319,212],[405,230],[425,244],[410,257],[366,243],[328,231]],"#172532");
  polygon([[328,214],[399,230],[405,238],[336,223]],"#617687");
  polygon([[365,243],[393,250],[407,263],[387,272],[363,262]],"#0d1721");
  polygon([[389,248],[420,254],[449,300],[407,300],[382,264]],"#0e1823");
  polygon([[395,255],[415,258],[438,295],[412,295]],"#465b6c");
  polygon([[416,259],[421,260],[443,297],[437,296]],"#748797");
  ctx.strokeStyle = "#0b151e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(366,246); ctx.lineTo(370,266); ctx.lineTo(392,269);
  ctx.stroke();

  // Gloved hands stay below the slide.
  polygon([[359,251],[375,242],[392,252],[387,269],[367,270]],"#152330");
  polygon([[359,255],[373,247],[386,253],[380,263]],sleeveLight);
  polygon([[412,261],[437,254],[452,266],[444,286],[421,283]],"#172634");
  polygon([[416,264],[435,257],[446,267],[437,274]],sleeveLight);
  ctx.restore();
}

function drawHud(ctx, width, height, side, shooting, down) {
  ctx.save();
  drawWeapon(ctx,width,height,side);
  if (shooting) {
    const flashX = width * .565, flashY = height * .66;
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
    drawHud(ctx,width,height,side,shooting,down);
  }
}




