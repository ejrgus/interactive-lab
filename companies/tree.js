const app = document.querySelector('.tree-app');
const viewport = document.querySelector('#tree-viewport');
const canvas = document.querySelector('#tree-canvas');
const nodeLayer = document.querySelector('#node-layer');
const stageLayer = document.querySelector('#stage-layer');
const connectorLayer = document.querySelector('#connector-layer');
const search = document.querySelector('#tree-search');
const status = document.querySelector('#tree-status');
const inspector = document.querySelector('#node-inspector');
const inspectorScrim = document.querySelector('#inspector-scrim');
const infoToggle = document.querySelector('[data-info-toggle]');
const infoPanel = document.querySelector('#tree-info');
let graph = null;
let nodeMap = new Map();
let sourceMap = new Map();
let selectedNodeId = null;

const normalize = (value) => value.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');

function setSidebar(open) {
  app.classList.toggle('sidebar-collapsed', !open);
  document.querySelector('[data-sidebar-open]').setAttribute('aria-expanded', String(open));
}

function edgePath(from, to, edge) {
  const width = graph.meta.nodeWidth;
  const height = graph.meta.nodeHeight;
  const x1 = from.x + width;
  const y1 = from.y + height / 2;
  const x2 = to.x;
  const y2 = to.y + height / 2;
  if (Number.isFinite(edge.routeY)) {
    const lead = Math.min(160, Math.abs(x2 - x1) * .2);
    return `M ${x1} ${y1} C ${x1 + lead} ${y1}, ${x1 + lead} ${edge.routeY}, ${x1 + lead * 2} ${edge.routeY} L ${x2 - lead * 2} ${edge.routeY} C ${x2 - lead} ${edge.routeY}, ${x2 - lead} ${y2}, ${x2} ${y2}`;
  }
  const bend = Math.max(54, Math.min(230, Math.abs(x2 - x1) * .42));
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function renderStages() {
  stageLayer.replaceChildren(...graph.stages.map((stage) => {
    const column = document.createElement('div');
    column.className = `stage-column ${stage.id === 'current' ? 'current' : ''}`;
    column.style.left = `${stage.x}px`;
    const label = document.createElement('span');
    label.textContent = stage.label;
    column.append(label);
    return column;
  }));
}

function setOptionalText(sectionId, targetId, value) {
  const section = document.querySelector(sectionId);
  section.hidden = !value;
  document.querySelector(targetId).textContent = value || '';
}

function closeInspector() {
  inspector.classList.remove('is-open');
  inspector.setAttribute('aria-hidden', 'true');
  inspectorScrim.classList.remove('is-open');
  nodeLayer.querySelector(`[data-node-id="${selectedNodeId}"]`)?.classList.remove('is-selected');
  selectedNodeId = null;
}

function openInspector(node) {
  if (selectedNodeId === node.id && inspector.classList.contains('is-open')) {
    closeInspector();
    return;
  }
  nodeLayer.querySelector('.tree-node.is-selected')?.classList.remove('is-selected');
  selectedNodeId = node.id;
  nodeLayer.querySelector(`[data-node-id="${node.id}"]`)?.classList.add('is-selected');

  document.querySelector('#inspector-meta').textContent = `${node.year} · ${node.kind}`;
  document.querySelector('#inspector-title').textContent = node.label;
  document.querySelector('#inspector-detail').textContent = node.detail;
  setOptionalText('#inspector-context-section', '#inspector-context', node.context);
  setOptionalText('#inspector-ownership-section', '#inspector-ownership', node.ownership);

  const subsidiarySection = document.querySelector('#inspector-subsidiaries-section');
  const subsidiaries = node.subsidiaries || [];
  subsidiarySection.hidden = subsidiaries.length === 0;
  document.querySelector('#inspector-subsidiaries-title').textContent = node.subsidiariesTitle || '주요 계열사';
  document.querySelector('#inspector-subsidiaries').replaceChildren(...subsidiaries.map((item) => {
    const entry = document.createElement('div');
    entry.className = 'subsidiary-item';
    const name = document.createElement('strong');
    const description = document.createElement('span');
    if (typeof item === 'string') {
      name.textContent = item;
      description.textContent = '';
    } else {
      name.textContent = item.name;
      description.textContent = item.description || '';
    }
    entry.append(name, description);
    return entry;
  }));

  const links = (node.sourceIds || []).map((id) => sourceMap.get(id)).filter(Boolean).map((source) => {
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `출처 · ${source.title}`;
    return link;
  });
  document.querySelector('.source-section').hidden = links.length === 0;
  document.querySelector('#inspector-sources').replaceChildren(...links);
  inspector.classList.add('is-open');
  inspector.setAttribute('aria-hidden', 'false');
  inspectorScrim.classList.add('is-open');
}

function renderNodes() {
  nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  nodeLayer.replaceChildren(...graph.nodes.map((node) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `tree-node ${node.current ? 'is-current' : ''} ${node.external ? 'is-external' : ''}`;
    card.dataset.nodeId = node.id;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.setAttribute('aria-label', `${node.year} ${node.label}, ${node.note}. 상세 정보 보기`);
    const top = document.createElement('span');
    top.className = 'node-top';
    const year = document.createElement('span');
    year.className = 'node-year';
    year.textContent = node.year;
    const kind = document.createElement('span');
    kind.className = 'node-kind';
    kind.textContent = node.kind;
    top.append(year, kind);
    const title = document.createElement('strong');
    title.className = 'node-title';
    title.textContent = node.label;
    const note = document.createElement('span');
    note.className = 'node-note';
    note.textContent = node.note;
    card.append(top, title, note);
    card.addEventListener('click', () => openInspector(node));
    return card;
  }));
}

function renderEdges() {
  connectorLayer.setAttribute('viewBox', `0 0 ${graph.meta.canvasWidth} ${graph.meta.canvasHeight}`);
  connectorLayer.replaceChildren(...graph.edges.map((edge) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(nodeMap.get(edge.from), nodeMap.get(edge.to), edge));
    path.setAttribute('class', `tree-edge type-${edge.type}`);
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
  const raw = search.value.trim();
  const query = normalize(raw);
  const cards = [...nodeLayer.querySelectorAll('.tree-node')];
  const paths = [...connectorLayer.querySelectorAll('.tree-edge')];
  cards.forEach((card) => card.classList.remove('is-dimmed', 'is-highlighted', 'is-match'));
  paths.forEach((path) => path.classList.remove('is-dimmed', 'is-highlighted'));
  if (!query) {
    status.textContent = '기업을 검색하면 현재 기업까지 이어지는 경로만 강조됩니다.';
    return;
  }
  const allMatches = graph.nodes.filter((node) => normalize([node.label, ...(node.aliases || [])].join(' ')).includes(query));
  const exactCurrent = allMatches.filter((node) => node.current && normalize(node.label).includes(query));
  const matches = exactCurrent.length ? exactCurrent : allMatches;
  if (!matches.length) {
    cards.forEach((card) => card.classList.add('is-dimmed'));
    paths.forEach((path) => path.classList.add('is-dimmed'));
    status.textContent = `“${raw}” 검색 결과가 없습니다.`;
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
  const target = matches[0];
  status.textContent = `${matches.map((node) => node.label).join(', ')} 경로를 강조했습니다.`;
  viewport.scrollTo({ left: Math.max(0, target.x - viewport.clientWidth * .66), top: Math.max(0, target.y - viewport.clientHeight * .42), behavior: 'smooth' });
}

async function loadGraph() {
  try {
    const response = await fetch('../data/hyundai-family.json?v=20260920-4');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    graph = await response.json();
    sourceMap = new Map(graph.sources.map((source) => [source.id, source]));
    canvas.style.width = `${graph.meta.canvasWidth}px`;
    canvas.style.height = `${graph.meta.canvasHeight}px`;
    document.documentElement.style.setProperty('--node-width', `${graph.meta.nodeWidth}px`);
    document.documentElement.style.setProperty('--node-height', `${graph.meta.nodeHeight}px`);
    document.querySelector('[data-node-count]').textContent = `${graph.nodes.length}개 노드`;
    renderStages();
    renderNodes();
    renderEdges();
    canvas.setAttribute('aria-busy', 'false');
  } catch (error) {
    canvas.setAttribute('aria-busy', 'false');
    status.textContent = '계보 데이터를 불러오지 못했습니다.';
    console.error(error);
  }
}

document.querySelector('[data-sidebar-close]').addEventListener('click', () => setSidebar(false));
document.querySelector('[data-sidebar-open]').addEventListener('click', () => setSidebar(true));
document.querySelector('[data-inspector-close]').addEventListener('click', closeInspector);
inspectorScrim.addEventListener('click', closeInspector);
infoToggle.addEventListener('click', () => {
  const willOpen = infoPanel.hidden;
  infoPanel.hidden = !willOpen;
  infoToggle.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', (event) => {
  if (!infoPanel.hidden && !infoPanel.contains(event.target) && !infoToggle.contains(event.target)) {
    infoPanel.hidden = true;
    infoToggle.setAttribute('aria-expanded', 'false');
  }
});
search.addEventListener('input', updateSearch);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) { event.preventDefault(); search.focus(); }
  if (event.key === 'Escape') {
    if (!infoPanel.hidden) {
      infoPanel.hidden = true;
      infoToggle.setAttribute('aria-expanded', 'false');
    } else if (inspector.classList.contains('is-open')) closeInspector();
    else { search.value = ''; updateSearch(); search.blur(); }
  }
});
viewport.addEventListener('wheel', (event) => {
  if (event.shiftKey && event.deltaY !== 0) {
    viewport.scrollLeft += event.deltaY;
    event.preventDefault();
  }
}, { passive: false });
loadGraph();

