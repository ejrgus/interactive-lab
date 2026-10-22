import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {articleReader,renderArticleReading} from '../newsroom/reader.js';
import {READER_SOURCES} from '../newsroom/reader-sources.js';

const catalog=async name=>JSON.parse(await readFile(new URL(`../newsroom/catalogs/${name}.json`,import.meta.url),'utf8'));

test('all existing blocked-company articles stay inside the reader with their original identity',async()=>{
  const [lg,asml]=await Promise.all([catalog('lg-innotek'),catalog('asml')]);
  let mirrors=0,guides=0,native=0;
  for(const article of [...lg.articles,...asml.articles]){
    const original=JSON.stringify(article),plan=articleReader(article.url);
    assert.equal(plan.sourceUrl,article.url);
    if(plan.kind==='reading'){
      assert.equal(plan.sections.length,3);
      assert.ok(plan.sections.every(([title,text])=>title.length>2&&text.length>60));
      assert.equal(plan.checked,'2026-10-22');guides++;
    }else if(plan.provider){
      assert.match(plan.url,/^https:\/\/innotek\.tistory\.com\/\d+$/);
      assert.equal(plan.provider,'LG이노텍 공식 블로그');mirrors++;
    }else{assert.equal(new URL(plan.url).hostname,'www.asml.com');native++;}
    assert.equal(JSON.stringify(article),original,'Reader routing must not mutate IDs, URLs, or note identity');
  }
  assert.deepEqual({mirrors,guides,native},{mirrors:20,guides:18,native:1});
  assert.equal(Object.keys(READER_SOURCES).length,38);
});

test('reader matches official aliases and reordered queries without accepting lookalike hosts',()=>{
  const plan=articleReader('https://lginnotek.com/news/pressView.do?locale=ko&idx=6601&utm_source=test#top');
  assert.equal(plan.url,'https://innotek.tistory.com/1669');
  assert.equal(articleReader('https://www.investor.asml.com/news-releases/news-release-details/q1-2026-financial-results').kind,'reading');
  for(const url of ['https://www.lginnotek.com.example.org/news/pressView.do?idx=6601&locale=ko','https://investor.asml.com.example.org/story','https://news.skhynix.co.kr/ihbm-solution'])assert.equal(articleReader(url).kind,'frame');
  assert.equal(articleReader('').kind,'none');
  assert.throws(()=>articleReader('javascript:alert(1)'));
  assert.throws(()=>articleReader('https://user:password@example.com/'));
  const unknown=articleReader('https://www.lginnotek.com/news/pressView.do?idx=999999&locale=ko');
  assert.equal(unknown.kind,'reading');assert.equal(unknown.sections,null);
});

// A small DOM double checks rendered content boundaries without running browser scripts.
class Element{
  constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
}
const dom=()=>{const doc={createElement(tag){return new Element(tag,doc);}};return new Element('article',doc);};
const allNodes=node=>[node,...node.children.flatMap(allNodes)];

test('reading guides label paraphrases and render data as text without live HTML or outgoing navigation',()=>{
  const container=dom();
  const sourceUrl='https://investor.asml.com/news-releases/news-release-details/q1-2026-financial-results';
  renderArticleReading(container,{title:'<img src=x onerror=alert(1)>',company:'ASML',date:'2026-04-15'},
    {...articleReader(sourceUrl),sections:[['<script>not code</script>','<iframe src="evil">literal article text</iframe>']]});
  const nodes=allNodes(container);
  assert.ok(nodes.some(n=>n.textContent.includes('원문 전체나 원문 사이트 화면은 아닙니다')));
  assert.ok(nodes.some(n=>n.textContent==='<img src=x onerror=alert(1)>'));
  assert.ok(nodes.some(n=>n.textContent.includes('literal article text')));
  assert.ok(nodes.every(n=>!['script','iframe','img','a'].includes(n.tag)));
  renderArticleReading(container,{title:'새 기사'}, {kind:'reading',sourceUrl,sections:null});
  assert.ok(allNodes(container).some(n=>n.textContent.includes('아직 준비되지')));
  assert.ok(allNodes(container).every(n=>!n.textContent.includes('literal article text')),'Old content must clear when changing article');
});
