/* htm-lite: ตัวแปลง template `html`...`` เป็น React.createElement ที่เขียนเองให้ใช้ไวยากรณ์เดียวกับ htm (<${Comp} a=${b}/>, <//>)
   ใช้ในเครื่องโดยไม่ต้องโหลดจาก CDN ถ้าต้องการใช้ไลบรารี htm ตัวจริงให้เปลี่ยนแท็ก <script> ใน index.html กลับไปใช้ได้ทันที */
(function(){
  window.htm = { bind(h){ h = h || React.createElement; return function(strings, ...vals){
    const src = strings.reduce((a,s,i)=> a + s + (i<vals.length ? '\u0001'+i+'\u0002' : ''), '');
    let p = 0;
    const PH = /\u0001(\d+)\u0002/g;
    const val = str => { const m = /^\u0001(\d+)\u0002$/.exec(str); if (m) return vals[+m[1]]; return str.replace(PH,(_,i)=>vals[+i]); };
    const ws = /\s/;
    function text(t){ const out=[]; let last=0, m; PH.lastIndex=0;
      const parts=[]; while((m=PH.exec(t))){ parts.push(['s',t.slice(last,m.index)]); parts.push(['v',vals[+m[1]]]); last=PH.lastIndex; } parts.push(['s',t.slice(last)]);
      parts.forEach(([k,v])=>{ if(k==='v') out.push(v); else { if(/\n/.test(v)) v=v.replace(/^\s*\n\s*|\s*\n\s*$/g,'').replace(/\s*\n\s*/g,' '); if(v) out.push(v);} });
      return out; }
    function parseEl(){ // at '<'
      p++; let name='';
      if (src[p]==='/') { // closing
        const e = src.indexOf('>', p); p = e+1; return null; }
      while(p<src.length && !ws.test(src[p]) && src[p]!=='>' && !(src[p]==='/'&&src[p+1]==='>')) name+=src[p++];
      name = val(name);
      const props = {}; let self=false;
      for(;;){
        while(ws.test(src[p])) p++;
        if (src[p]==='>') { p++; break; }
        if (src[p]==='/'&&src[p+1]==='>') { p+=2; self=true; break; }
        if (src.startsWith('...',p)) { p+=3; let t=''; while(!ws.test(src[p])&&src[p]!=='>'&&src[p]!=='/') t+=src[p++]; Object.assign(props,val(t)); continue; }
        let an=''; while(p<src.length && !ws.test(src[p]) && src[p]!=='=' && src[p]!=='>' && !(src[p]==='/'&&src[p+1]==='>')) an+=src[p++];
        if (src[p]==='=') { p++; let v='';
          if (src[p]==='"'||src[p]==="'") { const q=src[p++]; while(src[p]!==q) v+=src[p++]; p++; props[an]=val(v); }
          else { while(!ws.test(src[p])&&src[p]!=='>'&&!(src[p]==='/'&&src[p+1]==='>')) v+=src[p++]; props[an]=val(v); }
        } else props[an]=true;
      }
      const kids=[];
      if(!self){ for(;;){ if(p>=src.length) break; if(src[p]==='<'){ if(src[p+1]==='/'){ const e=src.indexOf('>',p); p=e+1; break; } kids.push(parseEl()); } else { let e=src.indexOf('<',p); if(e<0) e=src.length; text(src.slice(p,e)).forEach(x=>kids.push(x)); p=e; } } }
      return h(name, props, ...kids);
    }
    const roots=[]; while(p<src.length){ if(src[p]==='<') roots.push(parseEl()); else { let e=src.indexOf('<',p); if(e<0) e=src.length; text(src.slice(p,e)).forEach(x=>roots.push(x)); p=e; } }
    return roots.length===1?roots[0]:roots;
  };}};
})();
