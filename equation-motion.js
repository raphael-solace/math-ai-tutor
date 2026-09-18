/* Animate MathML parts in their measured layout, preserving matching subexpressions. */
const EquationMotion = (() => {
  const leafSelector = 'mi, mn, mo, mtext';
  const duration = 2400;
  const signature = node => node.outerHTML.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  const tokenKey = node => `${node.localName}:${node.textContent.trim()}`;

  function measure(frame, viewport) {
    const origin = viewport.getBoundingClientRect();
    const box = node => {
      const rect = node.getBoundingClientRect();
      return {x:rect.left-origin.left+viewport.scrollLeft, y:rect.top-origin.top+viewport.scrollTop, width:rect.width, height:rect.height};
    };
    const tokens = [...frame.querySelectorAll(leafSelector)].map(node => ({node, key:tokenKey(node), ...box(node)}));
    const bars = [...frame.querySelectorAll('mfrac')].map(node => {
      const rect = box(node), numerator = box(node.children[0]), denominator = box(node.children[1]);
      return {node, key:`bar:${signature(node)}`, x:rect.x, y:(numerator.y+numerator.height+denominator.y)/2, width:rect.width, height:1, bar:true};
    });
    return {frame,tokens,bars};
  }

  function matchParts(from, to) {
    const pairs = [], usedFrom = new Set(), usedTo = new Set();
    const sourceByNode = new Map(from.tokens.map(token=>[token.node,token]));
    const targetByNode = new Map(to.tokens.map(token=>[token.node,token]));
    const connect = (a,b) => {usedFrom.add(a);usedTo.add(b);pairs.push({from:a,to:b})};
    // Match whole unchanged subexpressions first. For example, 1+x² stays together
    // instead of confusing its x or 1 with another occurrence across the equals sign.
    const groups = [...from.frame.querySelectorAll('mrow,mfrac,msup,msub')]
      .map(node=>({node,leaves:[...node.querySelectorAll(leafSelector)]}))
      .filter(group=>group.leaves.length>1)
      .sort((a,b)=>b.leaves.length-a.leaves.length);
    const targets = [...to.frame.querySelectorAll('mrow,mfrac,msup,msub')];
    for (const group of groups) {
      if (group.leaves.some(node=>usedFrom.has(sourceByNode.get(node)))) continue;
      const target = targets.find(node=>signature(node)===signature(group.node) &&
        [...node.querySelectorAll(leafSelector)].every(leaf=>!usedTo.has(targetByNode.get(leaf))));
      if (!target) continue;
      const leaves=[...target.querySelectorAll(leafSelector)];
      group.leaves.forEach((node,index)=>connect(sourceByNode.get(node),targetByNode.get(leaves[index])));
    }
    // Remaining identical symbols follow the shortest available path.
    for (const target of to.tokens) {
      if (usedTo.has(target)) continue;
      const candidates=from.tokens.filter(source=>!usedFrom.has(source)&&source.key===target.key);
      candidates.sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y));
      if(candidates.length)connect(candidates[0],target);
    }
    for (const target of to.bars) {
      const source=from.bars.find(bar=>!usedFrom.has(bar)&&bar.key===target.key) || from.bars.find(bar=>!usedFrom.has(bar));
      if(source)connect(source,target);
    }
    return {pairs,removed:[...from.tokens,...from.bars].filter(token=>!usedFrom.has(token)),added:[...to.tokens,...to.bars].filter(token=>!usedTo.has(token))};
  }

  function ghost(part, layer) {
    const element=document.createElement('span');
    element.className=part.bar?'motion-bar':'motion-token';
    element.style.left=`${part.x}px`;
    element.style.top=`${part.y}px`;
    if(part.bar)element.style.width=`${part.width}px`;
    else {
      const math=document.createElementNS('http://www.w3.org/1998/Math/MathML','math');
      math.style.fontSize=getComputedStyle(part.node).fontSize;
      math.append(part.node.cloneNode(true));element.append(math);
    }
    layer.append(element);
    // Normalize stretched delimiters and script-size glyphs to their source geometry.
    const rect=element.getBoundingClientRect();
    if(part.bar)return {element,sx:1,sy:1};
    const glyph=element.querySelector(leafSelector).getBoundingClientRect();
    element.firstElementChild.style.transform=`translate(${rect.left-glyph.left}px,${rect.top-glyph.top}px)`;
    return {element,sx:part.width/(glyph.width||1),sy:part.height/(glyph.height||1)};
  }

  function attach(panel) {
    const viewport=panel.querySelector('.formula-viewport');
    let animations=[],timer,layer;
    const reset=()=>{
      clearTimeout(timer);
      animations.forEach(animation=>animation.cancel());animations=[];
      layer?.remove();layer=null;panel.classList.remove('playing');
    };
    const play=()=>{
      reset();
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const from=measure(panel.querySelector('.formula-from'),viewport);
      const to=measure(panel.querySelector('.formula-to'),viewport);
      const plan=matchParts(from,to);
      layer=document.createElement('span');layer.className='motion-layer';layer.setAttribute('aria-hidden','true');viewport.append(layer);
      const animate=(part,frames)=>{
        const clone=ghost(part,layer);
        const keys=frames.map(frame=>({...frame,transform:`translate(${frame.x||0}px,${frame.y||0}px) scale(${clone.sx*(frame.sx??1)},${clone.sy*(frame.sy??1)})`}));
        animations.push(clone.element.animate(keys,{duration,fill:'both',easing:'linear'}));
      };
      for(const {from:a,to:b} of plan.pairs){
        const dx=b.x-a.x,dy=b.y-a.y,sx=b.width/(a.width||1),sy=b.height/(a.height||1);
        const moving=Math.hypot(dx,dy)>3;
        animate(a,[
          {offset:0,opacity:1},{offset:.2,opacity:1},
          {offset:.5,x:dx*.5,y:dy*.5+(moving?(dy>0?12:-12):0),sx:(1+sx)/2,sy:(1+sy)/2,opacity:1},
          {offset:.8,x:dx,y:dy,sx,sy,opacity:1},
          {offset:1,x:dx,y:dy,sx,sy,opacity:1}
        ]);
      }
      for(const part of plan.removed)animate(part,[{offset:0,opacity:1},{offset:.25,opacity:1},{offset:.6,y:-12,sy:.65,opacity:0},{offset:1,y:-12,opacity:0}]);
      for(const part of plan.added)animate(part,[{offset:0,y:12,sy:.65,opacity:0},{offset:.45,y:12,sy:.65,opacity:0},{offset:.82,opacity:1},{offset:1,opacity:1}]);
      panel.classList.add('playing');
      timer=setTimeout(reset,duration);
    };
    panel.addEventListener('mouseenter',play);
    panel.addEventListener('mouseleave',reset);
    panel.addEventListener('blur',reset);
    panel.addEventListener('click',play);
    // Changing exercises, resizing, or scrolling must not leave detached animations.
    const observer=new ResizeObserver(()=>{if(panel.classList.contains('playing'))reset()});observer.observe(viewport);
    return ()=>{reset();observer.disconnect()};
  }
  return {attach};
})();
