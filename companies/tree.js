const app = document.querySelector('.tree-app');
const viewport = document.querySelector('#tree-viewport');
const canvas = document.querySelector('#tree-canvas');
const nodeLayer = document.querySelector('#node-layer');
const stageLayer = document.querySelector('#stage-layer');
const connectorLayer = document.querySelector('#connector-layer');
const search = document.querySelector('#tree-search');
const status = document.querySelector('#tree-status');
const openButton = document.querySelector('[data-sidebar-open]');
const closeButton = document.querySelector('[data-sidebar-close]');
const resetButton = document.querySelector('[data-reset-view]');

let graph = null;
let nodeMap = new Map();
const normalize = (value) => value.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');

function setSidebar(open) {
  app.classList.toggle('sidebar-collapsed', !open);
  openButton.setAttribute('aria-expanded', String(open));
  if (open && window.matchMedia('(max-width: 820px)').matches) search.focus();
}

function edgePath(from, to) {
  const nodeWidth = 248;
  const nodeHeight = 90;
  const x1 = from.x + nodeWidth;
  const y1 = from.y + nodeHeight / 2;
  const x2 = to.x;
  const y2 = to.y + nodeHeight / 2;
  const bend = Math.max(72, (x2 - x1) * .48);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function renderStages(stages) {
  stageLayer.replaceChildren(...stages.map((stage) => {
    const column = document.createElement('div');
    column.className = 'stage-column';
    column.style.left = `${stage.x}px`;
    const label = document.createElement('span');
    label.textContent = stage.label;
    column.append(label);
    return column;
  }));
}

function renderNodes(nodes) {
  nodeMap = new Map(nodes.map((node) => [node.id, node]));
  nodeLayer.replaceChildren(...nodes.map((node) => {
    const card = document.createElement('article');
    card.className = `tree-node ${node.current ? 'is-current' : ''} ${node.placeholder ? 'is-placeholder' : ''}`;
    card.dataset.nodeId = node.id;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    icon.textContent = node.icon;
    const copy = document.createElement('span');
    copy.className = 'node-copy';
    const stage = document.createElement('span');
    stage.className = 'node-stage';
    stage.textContent = node.stage;
    const title = document.createElement('strong');
    title.className = 'node-title';
    title.textContent = node.label;
    const state = document.createElement('span');
    state.className = 'node-state';
    state.textContent = node.note;
    copy.append(stage, title, state);
    card.append(icon, copy);
    return card;
  }));
}

function renderEdges(edges) {
  connectorLayer.setAttribute('viewBox', '0 0 2200 1000');
  connectorLayer.replaceChildren(...edges.map((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(from, to));
    path.setAttribute('class', `tree-edge type-${edge.type}`);
    path.dataset.edgeId = edge.id;
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    return path;
  }));
}

function ancestorsOf(ids) {
  const included = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    graph.edges.forEach((edge) => {
      if (included.has(edge.to) && !included.has(edge.from)) {
        included.add(edge.from);
        changed = true;
      }
    });
  }
  return included;
}

function updateSearch() {
  if (!graph) return;
  const rawQuery = search.value.trim();
  const query = normalize(rawQuery);
  const cards = [...nodeLayer.querySelectorAll('.tree-node')];
  const paths = [...connectorLayer.querySelectorAll('.tree-edge')];
  cards.forEach((card) => card.classList.remove('is-dimmed', 'is-highlighted', 'is-match'));
  paths.forEach((path) => path.classList.remove('is-dimmed', 'is-highlighted'));
  if (!query) {
    status.textContent = '왼쪽은 과거, 오른쪽은 현재입니다. 가로로 움직여 전체 흐름을 살펴보세요.';
    return;
  }
  const allMatches = graph.nodes.filter((node) => normalize([node.label, ...(node.aliases || [])].join(' ')).includes(query));
  const currentMatches = allMatches.filter((node) => node.current);
  const matches = currentMatches.length ? currentMatches : allMatches;
  if (!matches.length) {
    cards.forEach((card) => card.classList.add('is-dimmed'));
    paths.forEach((path) => path.classList.add('is-dimmed'));
    status.textContent = `“${rawQuery}” 검색 결과가 없습니다. 아직 준비 중인 기업일 수 있습니다.`;
    return;
  }
  const matchIds = new Set(matches.map((node) => node.id));
  const pathIds = ancestorsOf(matchIds);
  cards.forEach((card) => {
    const active = pathIds.has(card.dataset.nodeId);
    card.classList.toggle('is-highlighted', active);
    card.classList.toggle('is-match', matchIds.has(card.dataset.nodeId));
    card.classList.toggle('is-dimmed', !active);
  });
  paths.forEach((path) => {
    const active = pathIds.has(path.dataset.from) && pathIds.has(path.dataset.to);
    path.classList.toggle('is-highlighted', active);
    path.classList.toggle('is-dimmed', !active);
  });
  status.textContent = `${matches.map((node) => node.label).join(', ')}으로 이어지는 경로를 강조했습니다.`;
  const target = matches[0];
  viewport.scrollTo({ left: Math.max(0, target.x - viewport.clientWidth * .58), top: Math.max(0, target.y - viewport.clientHeight * .35), behavior: 'smooth' });
}

async function loadGraph() {
  try {
    const response = await fetch('../data/hyundai-family.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    graph = await response.json();
    renderStages(graph.stages);
    renderNodes(graph.nodes);
    renderEdges(graph.edges);
    canvas.setAttribute('aria-busy', 'false');
    requestAnimationFrame(() => viewport.scrollTo({ left: 0, top: 225 }));
  } catch (error) {
    canvas.setAttribute('aria-busy', 'false');
    const message = document.createElement('p');
    message.className = 'tree-error';
    message.textContent = '계보 구조를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    canvas.append(message);
    console.error(error);
  }
}

openButton.addEventListener('click', () => setSidebar(true));
closeButton.addEventListener('click', () => setSidebar(false));
resetButton.addEventListener('click', () => {
  search.value = '';
  updateSearch();
  viewport.scrollTo({ left: 0, top: 225, behavior: 'smooth' });
});
search.addEventListener('input', updateSearch);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault();
    if (app.classList.contains('sidebar-collapsed')) setSidebar(true);
    search.focus();
  }
  if (event.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    updateSearch();
    search.blur();
  }
});
viewport.addEventListener('wheel', (event) => {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.ctrlKey) {
    viewport.scrollLeft += event.deltaY;
    event.preventDefault();
  }
}, { passive: false });
if (window.matchMedia('(max-width: 820px)').matches) setSidebar(false);
loadGraph();

