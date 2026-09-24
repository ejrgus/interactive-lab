import { calculate, estimateWinChance, START_TIME, SERVER_BUFFER, CLIENT_BUFFER } from "./model.js";
import { View3D } from "./scene.js?v=20260924-06";

const presets = [
  { peekerPing:40, holderPing:40, peekerReaction:300, holderReaction:220,
    explanation:"같은 40ms 핑에서 Peeker는 80ms 느리게 반응해도 서버 판정에서 약 25.6ms 앞섭니다." },
  { peekerPing:40, holderPing:40, peekerReaction:300, holderReaction:175,
    explanation:"같은 40ms 핑에서 Holder는 Peeker보다 125ms 빨리 반응해 약 19.4ms 먼저 처리됩니다." },
  { peekerPing:20, holderPing:100, peekerReaction:250, holderReaction:250,
    explanation:"반응속도가 같아도 Holder의 핑이 100ms면 Peeker의 사격이 약 165.6ms 앞섭니다." },
  { peekerPing:200, holderPing:10, peekerReaction:250, holderReaction:250,
    explanation:"이 단순 모형에서는 Peeker의 대칭 핑이 이동과 사격에 함께 적용돼 상쇄됩니다. 기준값 판정은 Peeker가 75.6ms 앞서지만, 실제로 높은 핑이 유리하다는 뜻은 아닙니다." },
];

const fields = ["peekerPing","holderPing","peekerReaction","holderReaction"];
const inputs = Object.fromEntries(fields.map(id => [id,document.getElementById(id)]));
const views = {
  peeker: new View3D(document.getElementById("peekerView"),"peeker"),
  holder: new View3D(document.getElementById("holderView"),"holder"),
};
const runButton = document.getElementById("runButton");
const pauseButton = document.getElementById("pauseButton");
const scrubber = document.getElementById("scrubber");
const speedSelect = document.getElementById("speedSelect");
const markerRail = document.getElementById("timelineMarkers");
const simulation = document.querySelector(".simulation");
let settings = { ...presets[0] };
let model = calculate(settings);
let currentTime = START_TIME;
let selectedPreset = 0;
let playing = false;
let finished = false;
let lastFrame = 0;
let animation = 0;
let markers = [];

function fmt(value) { return `${Math.round(value * 10) / 10}ms`; }
function clockText(time) { return `${time < 0 ? "−" : "+"}${Math.round(Math.abs(time))} ms`; }

function readInputs() {
  return Object.fromEntries(fields.map(id => [id, Number(inputs[id].value)]));
}

function updateLabels() {
  for (const id of fields) document.getElementById(`${id}Value`).value = `${inputs[id].value} ms`;
  document.getElementById("visibilityReadout").textContent = fmt(model.holderSees);
  const budget = settings.peekerReaction - model.advantage;
  document.getElementById("budgetReadout").textContent = budget <= 0 ? "즉시 반응해도 어려움" : `${fmt(budget)} 미만`;
  document.getElementById("formulaReadout").textContent =
    `기준값의 서버 처리 차이 = Holder 반응 ${settings.holderReaction}ms − Peeker 반응 ${settings.peekerReaction}ms + Holder 핑 ${settings.holderPing}ms + 서버 버퍼 ${fmt(SERVER_BUFFER)} + 화면 버퍼 ${fmt(CLIENT_BUFFER)} = ${fmt(model.serverGap)}. 양수면 Peeker가 먼저 처리됩니다. 대칭 지연 가정에서는 Peeker 핑이 이 차이에서 상쇄됩니다.`;
}

function updatePhase() {
  const time = currentTime;
  const peekerStatus = document.getElementById("peekerStatus");
  const holderStatus = document.getElementById("holderStatus");
  const phaseLabel = document.getElementById("phaseLabel");
  const narration = document.getElementById("narration");
  const phaseBanner = document.getElementById("phaseBanner");
  const peekerDown = !model.peekerWins && !model.simultaneous && time >= model.peekerDeathNotice;
  const holderDown = model.peekerWins && time >= model.holderDeathNotice;
  peekerStatus.textContent = peekerDown ? "피격" : time >= model.peekerFires ? "사격" : time >= 0 ? "Holder 발견" : "벽 뒤";
  holderStatus.textContent = holderDown ? "피격" : time >= model.holderFires ? "사격" : time >= model.holderSees ? "Peeker 발견" : "Peeker 안 보임";
  if (time < 0) {
    phaseBanner.dataset.phase = "approach";
    phaseLabel.textContent = "벽 뒤에서 접근";
    narration.textContent = "Peeker가 엄폐 뒤에서 모퉁이로 이동합니다.";
  } else if (time < model.holderSees) {
    phaseBanner.dataset.phase = "peeker";
    phaseLabel.textContent = "Peeker만 발견";
    narration.textContent = `Peeker는 Holder를 봤지만 Holder 화면에는 아직 Peeker가 없습니다. 가시성 격차 ${fmt(model.holderSees)}.`;
  } else if (time < Math.min(model.peekerFires,model.holderFires)) {
    phaseBanner.dataset.phase = "both";
    phaseLabel.textContent = "양쪽 모두 발견";
    narration.textContent = "이제 두 화면에 상대가 보입니다. 각자의 반응시간이 흐릅니다.";
  } else if (time < Math.min(model.peekerProcessed,model.holderProcessed)) {
    phaseBanner.dataset.phase = "shots";
    phaseLabel.textContent = "사격이 서버로 이동";
    narration.textContent = "화면에서 발사한 탄의 판정 명령이 서버에 도착하는 중입니다.";
  } else if (time < model.endTime) {
    phaseBanner.dataset.phase = "judged";
    phaseLabel.textContent = "서버 판정 완료";
    narration.textContent = model.simultaneous ? "두 명령이 동시에 처리됩니다." :
      `${model.peekerWins ? "Peeker" : "Holder"}의 사격이 서버에서 ${fmt(Math.abs(model.serverGap))} 먼저 처리됩니다.`;
  } else {
    phaseBanner.dataset.phase = "finished";
    phaseLabel.textContent = "시뮬레이션 종료";
    narration.textContent = "화면 위의 교전 결과에서 승리 확률을 확인하세요.";
  }
}

function updateMarkers() {
  const events = [
    ["Peeker 발견", 0, "peeker", true],
    ["Holder 발견", model.holderSees, "holder", true],
    ["Peeker 발사", model.peekerFires, "peeker", model.simultaneous || model.peekerWins || model.peekerFires < model.peekerDeathNotice],
    ["Holder 발사", model.holderFires, "holder", model.simultaneous || !model.peekerWins || model.holderFires < model.holderDeathNotice],
    ["Peeker 사망", model.peekerDeathNotice, "peeker", !model.peekerWins && !model.simultaneous],
    ["Holder 사망", model.holderDeathNotice, "holder", model.peekerWins],
  ];
  markerRail.replaceChildren();
  markers = events.map(([label,time,side,occurs],index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `timeline-marker is-${side}${occurs ? "" : " is-inactive"}`;
    marker.style.left = `${(time - START_TIME) / (model.endTime - START_TIME) * 100}%`;
    marker.style.top = `${index % 3 * 15}px`;
    marker.textContent = label.replace("Peeker","P").replace("Holder","H");
    marker.title = `${label}: ${occurs ? clockText(time) : "미발생 (가상 시각 " + clockText(time) + ")"}`;
    marker.setAttribute("aria-label",marker.title);
    if (occurs) marker.addEventListener("click",() => {
      stop();
      currentTime = time;
      hideResult();
      render();
    });
    else marker.disabled = true;
    markerRail.append(marker);
    return { element:marker,time,occurs };
  });
}

function render() {
  views.peeker.render(currentTime,model);
  views.holder.render(currentTime,model);
  scrubber.value = String(Math.round(currentTime));
  document.getElementById("clock").textContent = clockText(currentTime);
  updatePhase();
  for (const marker of markers) marker.element.classList.toggle("is-active",marker.occurs && Math.abs(currentTime - marker.time) < 18);
}

function showResult() {
  if (finished) return;
  finished = true;
  const chance = estimateWinChance(settings);
  const title = document.getElementById("winnerTitle");
  title.textContent = model.simultaneous ? "기준값: 동시 처리" : model.peekerWins ? "기준값: Peeker 선착" : "기준값: Holder 선착";
  title.className = model.simultaneous ? "tie" : model.peekerWins ? "pwin" : "hwin";
  document.getElementById("winnerDetail").textContent = model.simultaneous
    ? "이 조건의 동시 처리는 게임 규칙에 따라 달라집니다."
    : `서버 사격 처리 차이 ${fmt(Math.abs(model.serverGap))} · ${model.peekerWins ? "Peeker" : "Holder"} 선착`;
  const peekerPercent = Math.round(chance.peeker * 100);
  document.getElementById("peekerChance").textContent = `${peekerPercent}%`;
  document.getElementById("holderChance").textContent = `${100 - peekerPercent}%`;
  document.getElementById("chanceFill").style.width = `${peekerPercent}%`;
  document.getElementById("resultCard").hidden = false;
  runButton.textContent = "다시 재생";
}

function hideResult() {
  finished = false;
  document.getElementById("resultCard").hidden = true;
}

function stop() {
  playing = false;
  simulation.classList.remove("is-playing");
  pauseButton.disabled = true;
  pauseButton.textContent = "일시정지";
  if (animation) cancelAnimationFrame(animation);
  animation = 0;
}

function reset() {
  stop();
  model = calculate(settings);
  currentTime = START_TIME;
  hideResult();
  scrubber.max = String(Math.ceil(model.endTime));
  updateMarkers();
  runButton.textContent = "시뮬레이션 시작";
  updateLabels();
  render();
}

function frame(timestamp) {
  if (!playing) return;
  if (lastFrame) {
    const rate = currentTime < -120 ? .35 : currentTime < model.holderSees ? .045 :
      currentTime < Math.max(model.peekerFires,model.holderFires) ? .11 : .16;
    currentTime = Math.min(model.endTime, currentTime + Math.min(timestamp - lastFrame,60) * rate * Number(speedSelect.value));
  }
  lastFrame = timestamp;
  render();
  if (currentTime >= model.endTime) {
    stop();
    showResult();
    render();
  } else animation = requestAnimationFrame(frame);
}

function play() {
  if (finished || currentTime >= model.endTime) reset();
  if (playing) return;
  playing = true;
  lastFrame = 0;
  simulation.classList.add("is-playing");
  runButton.textContent = "처음부터 다시";
  pauseButton.disabled = false;
  pauseButton.textContent = "일시정지";
  animation = requestAnimationFrame(frame);
}

function choosePreset(index) {
  selectedPreset = index;
  for (const id of fields) inputs[id].value = String(presets[index][id]);
  settings = readInputs();
  for (const button of document.querySelectorAll("[data-preset]")) {
    const active = Number(button.dataset.preset) === index;
    button.classList.toggle("is-selected",active);
    button.setAttribute("aria-pressed",String(active));
  }
  document.getElementById("presetExplain").textContent = presets[index].explanation;
  reset();
}

document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click",() => choosePreset(Number(button.dataset.preset))));
for (const id of fields) inputs[id].addEventListener("input",() => {
  settings = readInputs();
  selectedPreset = -1;
  document.querySelectorAll("[data-preset]").forEach(button => {button.classList.remove("is-selected");button.setAttribute("aria-pressed","false");});
  document.getElementById("presetExplain").textContent = "사용자 설정 · 시뮬레이션 시작을 누르면 이 조건으로 재생됩니다.";
  reset();
});
runButton.addEventListener("click",() => { if (playing) reset(); play(); });
pauseButton.addEventListener("click",() => {
  if (playing) { stop(); pauseButton.disabled = false; pauseButton.textContent = "계속 재생"; }
  else play();
});
scrubber.addEventListener("input",() => {
  stop();
  currentTime = Number(scrubber.value);
  if (currentTime >= model.endTime) showResult();
  else if (finished) hideResult();
  render();
});
window.addEventListener("resize",render);
choosePreset(0);


