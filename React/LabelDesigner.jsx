import { useState, useRef, useEffect, useCallback, useMemo } from "react"

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS — Industrial Precision theme
   ═══════════════════════════════════════════════════════════════════════════ */
const C = {
  bg:        '#070B12',
  panel:     '#0B1119',
  panel2:    '#0F1720',
  raised:    '#131D28',
  border:    '#1C2D3F',
  border2:   '#243649',
  teal:      '#00DFC0',
  tealDim:   '#00DFC012',
  tealGlow:  '#00DFC040',
  tealMid:   '#00DFC060',
  blue:      '#3D87FF',
  blueGlow:  '#3D87FF30',
  green:     '#10D98A',
  red:       '#FF4C4C',
  redDim:    '#FF4C4C15',
  text:      '#E8F1FA',
  dim:       '#7A9EBE',
  muted:     '#456080',
  faint:     '#1A2C3D',
}

const MM       = 3.779528
const LABEL_W  = 148
const LABEL_H  = 105
const PAD      = 48
const RULER_SZ = 20
const HANDLE_R = 4.5
const SNAP_MM  = 0.5

const DATA_COLS = ['PartNumber','Quantity','AdviceNote','SerialNo','BatchNo','SupplierID','Description','Weight','EngChange','Date']

/* ═══════════════════════════════════════════════════════════════════════════
   INITIAL ODETTE LABEL ELEMENTS
   ═══════════════════════════════════════════════════════════════════════════ */
const INITIAL_ELS = [
  { id:'r0',      t:'rect',    x:0,y:0,w:148,h:105, stroke:'#222', fill:'none', sw:0.4, locked:true },
  { id:'lh1',     t:'line',    x1:0,y1:13,  x2:148,y2:13,   stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lh2',     t:'line',    x1:0,y1:39,  x2:148,y2:39,   stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lh3',     t:'line',    x1:0,y1:61,  x2:148,y2:61,   stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lh4',     t:'line',    x1:0,y1:79,  x2:76,y2:79,    stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lh5',     t:'line',    x1:0,y1:91,  x2:148,y2:91,   stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lv1',     t:'line',    x1:76,y1:0,  x2:76,y2:39,    stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lv2',     t:'line',    x1:76,y1:39, x2:76,y2:61,    stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lv3',     t:'line',    x1:99,y1:39, x2:99,y2:61,    stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lv4',     t:'line',    x1:122,y1:39,x2:122,y2:61,   stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lv5',     t:'line',    x1:76,y1:61, x2:76,y2:91,    stroke:'#BABABA', sw:0.3, locked:true },
  { id:'lv6',     t:'line',    x1:113,y1:91,x2:113,y2:105,  stroke:'#BABABA', sw:0.3, locked:true },
  ...[
    {id:'cp1', x:1.2,y:0.4,  w:73,h:3,  v:'Receiver'},
    {id:'cp2', x:77, y:0.4,  w:70,h:3,  v:'Dock / Gate'},
    {id:'cp3', x:1.2,y:13.4, w:73,h:3,  v:'Advice Note No. (N)'},
    {id:'cp4', x:77, y:13.4, w:70,h:3,  v:'Supplier Address'},
    {id:'cp5', x:77, y:39.4, w:22,h:3,  v:'Net Wt (kg)'},
    {id:'cp6', x:100,y:39.4, w:22,h:3,  v:'Gross Wt (kg)'},
    {id:'cp7', x:123,y:39.4, w:24,h:3,  v:'No. of Boxes'},
    {id:'cp8', x:1.2,y:39.4, w:73,h:3,  v:'Part Number (P)'},
    {id:'cp9', x:1.2,y:61.4, w:73,h:3,  v:'Quantity (Q)'},
    {id:'cp10',x:77, y:61.4, w:70,h:3,  v:'Description'},
    {id:'cp11',x:1.2,y:79.4, w:40,h:3,  v:'Supplier ID (V)'},
    {id:'cp12',x:77, y:79.4, w:70,h:3,  v:'Part No. Supplier (30S)'},
    {id:'cp13',x:1.2,y:91.4, w:73,h:3,  v:'Serial Number (S)'},
    {id:'cp14',x:77, y:91.4, w:35,h:3,  v:'Date'},
    {id:'cp15',x:114,y:91.4, w:33,h:3,  v:'Eng. Change'},
  ].map(c=>({t:'text',fz:1.6,bold:false,color:'#777',align:'left',bind:null,locked:true,value:c.v,...c})),
  { id:'f_receiver', t:'text', x:2,  y:2.5, w:73, h:10, value:'WAGTAIL CORP\nChennai — 600032', fz:4.8, bold:true,  color:'#111', align:'center', bind:null },
  { id:'f_dock',     t:'text', x:77, y:2,   w:70, h:11, value:'F-11  020',                      fz:8.5, bold:true,  color:'#111', align:'center', bind:null },
  { id:'f_advno',    t:'text', x:2,  y:15,  w:73, h:7,  value:'1030046',                        fz:5.5, bold:true,  color:'#111', align:'center', bind:{col:'AdviceNote'} },
  { id:'b_advno',    t:'barcode',x:2, y:23, w:73, h:15, value:'1030046', sym:'code128',          bind:{col:'AdviceNote'} },
  { id:'f_supaddr',  t:'text', x:77, y:16,  w:70, h:7,  value:'COOLING SYSTEMS LTD, NEW DELHI', fz:3.3, bold:true,  color:'#111', align:'center', bind:null },
  { id:'f_net',      t:'text', x:77, y:42,  w:22, h:9,  value:'556.16',  fz:4.2, bold:true, color:'#111', align:'center', bind:null },
  { id:'f_gross',    t:'text', x:100,y:42,  w:22, h:9,  value:'581.16',  fz:4.2, bold:true, color:'#111', align:'center', bind:null },
  { id:'f_boxes',    t:'text', x:123,y:42,  w:24, h:9,  value:'1',       fz:4.2, bold:true, color:'#111', align:'center', bind:null },
  { id:'f_partno',   t:'text', x:2,  y:41.5,w:73, h:13, value:'0204N32409', fz:8, bold:true, color:'#111', align:'left',   bind:{col:'PartNumber'} },
  { id:'b_partno',   t:'barcode',x:2, y:55, w:73, h:6,  value:'0204N32409', sym:'code128',  bind:{col:'PartNumber'} },
  { id:'q_main',     t:'qrcode', x:108,y:40,w:38, h:38, value:'P:0204N32409;Q:1760;S:000000001', bind:null },
  { id:'f_qty',      t:'text', x:2,  y:63.5,w:43, h:13, value:'1760',    fz:10, bold:true,  color:'#111', align:'left',   bind:{col:'Quantity'} },
  { id:'b_qty',      t:'barcode',x:2, y:78, w:43, h:11, value:'1760',    sym:'code128',     bind:{col:'Quantity'} },
  { id:'f_desc',     t:'text', x:77, y:63,  w:70, h:14, value:'VENTOLA COMPLETA', fz:4.8, bold:true, color:'#111', align:'right',  bind:null },
  { id:'f_supid',    t:'text', x:45, y:80,  w:30, h:9,  value:'SUP04461',fz:3.5, bold:true, color:'#111', align:'center', bind:null },
  { id:'f_supp',     t:'text', x:77, y:81,  w:70, h:6,  value:'0204N32409',fz:3.8,bold:true,color:'#111', align:'center', bind:{col:'PartNumber'} },
  { id:'b_supp',     t:'barcode',x:77,y:86, w:70, h:6,  value:'0204N32409', sym:'code128', bind:{col:'PartNumber'} },
  { id:'f_serial',   t:'text', x:2,  y:93,  w:73, h:10, value:'000000001',fz:4.5,bold:true, color:'#111', align:'center', bind:{col:'SerialNo'} },
  { id:'f_date',     t:'text', x:77, y:93,  w:35, h:10, value:'20220629', fz:4.5,bold:true, color:'#111', align:'left',   bind:null },
  { id:'f_engchg',   t:'text', x:114,y:93,  w:33, h:10, value:'Rev. 4',  fz:4.5, bold:true, color:'#111', align:'left',   bind:null },
]

/* ═══════════════════════════════════════════════════════════════════════════
   CANVAS DRAWING HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
function fakeBarcode(ctx, x, y, w, h) {
  ctx.save()
  ctx.fillStyle = '#fff'; ctx.fillRect(x,y,w,h)
  const n = Math.floor(w*1.25)
  const bw = w/n
  let s = 0x9E3779B9
  const rng=()=>{ s=(s^s<<13)>>>0; s=(s^s>>7)>>>0; s=(s^s<<17)>>>0; return s }
  ctx.fillStyle='#000'
  ctx.fillRect(x+bw,   y+1, bw,    h*0.82)
  ctx.fillRect(x+3*bw, y+1, bw*1.5,h*0.82)
  for(let i=5;i<n-5;i++){
    const thick = rng()%7===0?2:rng()%11===0?3:1
    if(rng()%3!==0){ ctx.fillRect(x+i*bw,y+1,bw*thick*0.9,h*0.82); i+=thick-1 }
  }
  ctx.fillRect(x+(n-4)*bw,y+1,bw,    h*0.82)
  ctx.fillRect(x+(n-2)*bw,y+1,bw*1.5,h*0.82)
  ctx.restore()
}

function fakeQR(ctx, x, y, sz) {
  ctx.save()
  ctx.fillStyle='#fff'; ctx.fillRect(x,y,sz,sz)
  const M=25, cs=sz/M
  const finder=(fx,fy)=>{
    ctx.fillStyle='#000'; ctx.fillRect(fx,fy,cs*7,cs*7)
    ctx.fillStyle='#fff'; ctx.fillRect(fx+cs,fy+cs,cs*5,cs*5)
    ctx.fillStyle='#000'; ctx.fillRect(fx+cs*2,fy+cs*2,cs*3,cs*3)
  }
  finder(x,y); finder(x+(M-7)*cs,y); finder(x,y+(M-7)*cs)
  const ac=x+16*cs, ay=y+16*cs
  ctx.fillStyle='#000'; ctx.fillRect(ac,ay,cs*5,cs*5)
  ctx.fillStyle='#fff'; ctx.fillRect(ac+cs,ay+cs,cs*3,cs*3)
  ctx.fillStyle='#000'; ctx.fillRect(ac+cs*2,ay+cs*2,cs,cs)
  for(let i=8;i<M-8;i+=2){
    ctx.fillStyle='#000'
    ctx.fillRect(x+i*cs,y+6*cs,cs,cs); ctx.fillRect(x+6*cs,y+i*cs,cs,cs)
  }
  let s2=0xDEADBEEF
  const r2=()=>{ s2=(s2^s2<<13)>>>0; s2=(s2^s2>>7)>>>0; s2=(s2^s2<<5)>>>0; return s2 }
  ctx.fillStyle='#000'
  for(let row=0;row<M;row++) for(let col=0;col<M;col++){
    if(row<9&&col<9||row<9&&col>M-10||row>M-10&&col<9) continue
    if(row===6||col===6) continue
    if(row>13&&row<20&&col>13&&col<20) continue
    if(r2()%2===0) ctx.fillRect(x+col*cs,y+row*cs,cs*0.94,cs*0.94)
  }
  ctx.restore()
}

function elBounds(el) {
  if(el.t==='line'){
    const mx=Math.min(el.x1,el.x2), my=Math.min(el.y1,el.y2)
    return {x:mx,y:my,w:Math.max(Math.abs(el.x2-el.x1),2),h:Math.max(Math.abs(el.y2-el.y1),2)}
  }
  return {x:el.x,y:el.y,w:el.w,h:el.h}
}

function drawCanvas(ctx,els,selId,hovId,zoom,grid,W,H) {
  const S = MM*zoom
  const lw=LABEL_W*S, lh=LABEL_H*S
  const ox=PAD+RULER_SZ, oy=PAD+RULER_SZ

  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H)

  // workspace dot pattern
  ctx.fillStyle='#0C1A28'
  for(let dx=ox%20;dx<W;dx+=20) for(let dy=oy%20;dy<H;dy+=20) ctx.fillRect(dx,dy,1.4,1.4)

  // label drop shadow
  ctx.save()
  ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=30; ctx.shadowOffsetY=8
  ctx.fillStyle='#fff'
  ctx.fillRect(ox,oy,lw,lh)
  ctx.restore()

  // label surface
  ctx.fillStyle='#fff'; ctx.fillRect(ox,oy,lw,lh)

  // mm grid
  if(grid){
    const gsp=5*S
    ctx.save(); ctx.beginPath(); ctx.rect(ox,oy,lw,lh); ctx.clip()
    ctx.strokeStyle='rgba(61,135,255,0.08)'; ctx.lineWidth=0.5
    for(let gx=0;gx<=lw+0.5;gx+=gsp){ ctx.beginPath(); ctx.moveTo(ox+gx,oy); ctx.lineTo(ox+gx,oy+lh); ctx.stroke() }
    for(let gy=0;gy<=lh+0.5;gy+=gsp){ ctx.beginPath(); ctx.moveTo(ox,oy+gy); ctx.lineTo(ox+lw,oy+gy); ctx.stroke() }
    ctx.restore()
  }

  // clip & draw elements
  ctx.save(); ctx.beginPath(); ctx.rect(ox,oy,lw,lh); ctx.clip()
  for(const el of els){
    if(el.t==='text'){
      const ex=ox+el.x*S,ey=oy+el.y*S,ew=el.w*S,eh=el.h*S
      const fz=Math.max(6,el.fz*S)
      ctx.font=`${el.bold?'700':'400'} ${fz}px 'Helvetica Neue',Helvetica,Arial,sans-serif`
      ctx.fillStyle=el.color||'#111'; ctx.textBaseline='middle'
      const lines=(el.value||'').split('\n'), lnH=fz*1.28
      let ty=ey+(eh-lines.length*lnH)/2+lnH/2
      for(const ln of lines){
        ctx.textAlign=el.align==='center'?'center':el.align==='right'?'right':'left'
        const tx=el.align==='center'?ex+ew/2:el.align==='right'?ex+ew-1:ex+1.5
        ctx.fillText(ln,tx,ty,ew); ty+=lnH
      }
    } else if(el.t==='barcode'){
      fakeBarcode(ctx,ox+el.x*S,oy+el.y*S,el.w*S,el.h*S)
    } else if(el.t==='qrcode'){
      fakeQR(ctx,ox+el.x*S,oy+el.y*S,Math.min(el.w,el.h)*S)
    } else if(el.t==='rect'){
      const ex=ox+el.x*S,ey=oy+el.y*S,ew=el.w*S,eh=el.h*S
      if(el.fill&&el.fill!=='none'){ctx.fillStyle=el.fill;ctx.fillRect(ex,ey,ew,eh)}
      if(el.stroke){ctx.strokeStyle=el.stroke;ctx.lineWidth=(el.sw||0.5)*zoom;ctx.strokeRect(ex,ey,ew,eh)}
    } else if(el.t==='line'){
      ctx.strokeStyle=el.stroke||'#000'; ctx.lineWidth=(el.sw||0.5)*zoom
      ctx.beginPath(); ctx.moveTo(ox+el.x1*S,oy+el.y1*S); ctx.lineTo(ox+el.x2*S,oy+el.y2*S); ctx.stroke()
    }
  }
  ctx.restore()

  // binding dots
  for(const el of els){
    if(!el.bind) continue
    const b=elBounds(el)
    const dx=ox+(b.x+b.w)*S-6, dy=oy+b.y*S+6
    ctx.save(); ctx.shadowColor=C.teal; ctx.shadowBlur=6
    ctx.fillStyle=C.teal; ctx.beginPath(); ctx.arc(dx,dy,3.5,0,Math.PI*2); ctx.fill()
    ctx.restore()
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(dx,dy,3.5,0,Math.PI*2); ctx.stroke()
  }

  // hover
  if(hovId&&hovId!==selId){
    const he=els.find(e=>e.id===hovId)
    if(he&&!he.locked){
      const b=elBounds(he)
      ctx.strokeStyle=C.teal+'55'; ctx.lineWidth=1; ctx.setLineDash([3,3])
      ctx.strokeRect(ox+b.x*S-1,oy+b.y*S-1,b.w*S+2,b.h*S+2); ctx.setLineDash([])
    }
  }

  // selection
  if(selId){
    const sel=els.find(e=>e.id===selId)
    if(sel){
      const b=elBounds(sel)
      const sx=ox+b.x*S,sy=oy+b.y*S,sw=b.w*S,sh=b.h*S
      ctx.save(); ctx.shadowColor=C.blueGlow; ctx.shadowBlur=14
      ctx.strokeStyle=C.blue; ctx.lineWidth=1.5; ctx.setLineDash([5,3])
      ctx.strokeRect(sx-1.5,sy-1.5,sw+3,sh+3); ctx.setLineDash([])
      ctx.restore()
      const hpts=[[sx-1,sy-1],[sx+sw/2,sy-1],[sx+sw+1,sy-1],[sx-1,sy+sh/2],[sx+sw+1,sy+sh/2],[sx-1,sy+sh+1],[sx+sw/2,sy+sh+1],[sx+sw+1,sy+sh+1]]
      for(const [hx,hy] of hpts){
        ctx.save(); ctx.shadowColor=C.blue+'60'; ctx.shadowBlur=6
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(hx,hy,HANDLE_R,0,Math.PI*2); ctx.fill()
        ctx.strokeStyle=C.blue; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(hx,hy,HANDLE_R,0,Math.PI*2); ctx.stroke()
        ctx.restore()
      }
    }
  }

  // ruler bg strips
  ctx.fillStyle=C.panel2
  ctx.fillRect(0,0,W,RULER_SZ+PAD)
  ctx.fillRect(0,0,RULER_SZ+PAD,H)
  ctx.fillStyle=C.raised; ctx.fillRect(0,0,RULER_SZ+PAD,RULER_SZ+PAD)
  ctx.strokeStyle=C.border; ctx.lineWidth=1
  ctx.strokeRect(0.5,0.5,RULER_SZ+PAD-1,RULER_SZ+PAD-1)
  ctx.fillStyle=C.border
  ctx.fillRect(0,RULER_SZ+PAD-1,W,1)
  ctx.fillRect(RULER_SZ+PAD-1,0,1,H)

  // ruler ticks
  for(let mm=0;mm<=LABEL_W;mm+=5){
    const rx=ox+mm*S, major=mm%10===0
    ctx.fillStyle=major?C.dim:C.muted
    ctx.fillRect(rx,PAD+RULER_SZ-(major?9:4),1,major?9:4)
    if(major&&mm%20===0){
      ctx.fillStyle=C.muted; ctx.font=`${8.5}px 'Helvetica Neue',monospace`
      ctx.textAlign='center'; ctx.textBaseline='bottom'
      ctx.fillText(String(mm),rx,PAD+RULER_SZ-10)
    }
  }
  for(let mm=0;mm<=LABEL_H;mm+=5){
    const ry=oy+mm*S, major=mm%10===0
    ctx.fillStyle=major?C.dim:C.muted
    ctx.fillRect(PAD+RULER_SZ-(major?9:4),ry,major?9:4,1)
    if(major&&mm%20===0){
      ctx.save(); ctx.translate(PAD+RULER_SZ-10,ry); ctx.rotate(-Math.PI/2)
      ctx.fillStyle=C.muted; ctx.font=`${8.5}px 'Helvetica Neue',monospace`
      ctx.textAlign='center'; ctx.textBaseline='middle'
      ctx.fillText(String(mm),0,0); ctx.restore()
    }
  }

  // label border top
  ctx.strokeStyle='#C0C0C0'; ctx.lineWidth=0.7
  ctx.strokeRect(ox,oy,lw,lh)

  // corner label
  ctx.fillStyle=C.muted; ctx.font=`${7.5}px 'Helvetica Neue',sans-serif`
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText('mm',(RULER_SZ+PAD)/2,(RULER_SZ+PAD)/2)
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════════ */
export default function LabelDesigner() {
  const cvRef  = useRef(null)
  const dragRef= useRef(null)
  const [els,     setEls]    = useState(INITIAL_ELS)
  const [selId,   setSelId]  = useState(null)
  const [hovId,   setHovId]  = useState(null)
  const [tool,    setTool]   = useState('select')
  const [zoom,    setZoom]   = useState(1.1)
  const [grid,    setGrid]   = useState(true)
  const [cursor,  setCursor] = useState({x:'0.0',y:'0.0'})
  const [panel,   setPanel]  = useState('props')
  const [hidden,  setHidden] = useState({})

  const origin = PAD + RULER_SZ

  useEffect(()=>{
    const cv=cvRef.current; if(!cv) return
    const dpr=window.devicePixelRatio||1
    const W=LABEL_W*MM*zoom+PAD*2+RULER_SZ
    const H=LABEL_H*MM*zoom+PAD*2+RULER_SZ
    cv.width=W*dpr; cv.height=H*dpr
    cv.style.width=W+'px'; cv.style.height=H+'px'
    const ctx=cv.getContext('2d')
    ctx.setTransform(dpr,0,0,dpr,0,0)
    const vis=els.filter(e=>!hidden[e.id])
    drawCanvas(ctx,vis,selId,hovId,zoom,grid,W,H)
  },[els,selId,hovId,zoom,grid,hidden])

  const getMm=e=>{
    const r=cvRef.current.getBoundingClientRect()
    return {x:(e.clientX-r.left-origin)/MM/zoom, y:(e.clientY-r.top-origin)/MM/zoom}
  }

  const hitTest=({x,y})=>{
    for(let i=els.length-1;i>=0;i--){
      const el=els[i]; if(el.locked||hidden[el.id]) continue
      const b=elBounds(el)
      if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h) return el.id
    }
    return null
  }

  const onMouseDown=e=>{
    const mm=getMm(e)
    if(tool==='select'){
      const hit=hitTest(mm); setSelId(hit)
      if(hit){
        const el=els.find(e2=>e2.id===hit), b=elBounds(el)
        dragRef.current={id:hit,sx:mm.x,sy:mm.y,ox:b.x,oy:b.y}
      }
    } else {
      const x=Math.round(mm.x/SNAP_MM)*SNAP_MM
      const y=Math.round(mm.y/SNAP_MM)*SNAP_MM
      const id=`el_${Date.now()}`
      let ne
      if(tool==='text')    ne={id,t:'text',    x,y,w:40,h:8,  value:'New Text', fz:4, bold:false, color:'#111', align:'left', bind:null}
      if(tool==='barcode') ne={id,t:'barcode', x,y,w:55,h:16, value:'00000000', sym:'code128',    bind:null}
      if(tool==='qr')      ne={id,t:'qrcode',  x,y,w:30,h:30, value:'omg', bind:null}
      if(tool==='rect')    ne={id,t:'rect',    x,y,w:30,h:20, stroke:'#000', fill:'none', sw:0.5}
      if(tool==='line')    ne={id,t:'line',  x1:x,y1:y,x2:x+30,y2:y, stroke:'#000', sw:0.5}
      if(ne){setEls(p=>[...p,ne]); setSelId(ne.id); setTool('select')}
    }
  }

  const onMouseMove=e=>{
    const mm=getMm(e)
    setCursor({x:Math.max(0,Math.min(LABEL_W,mm.x)).toFixed(1), y:Math.max(0,Math.min(LABEL_H,mm.y)).toFixed(1)})
    if(tool==='select') setHovId(hitTest(mm))
    if(dragRef.current&&e.buttons===1){
      const {id,sx,sy,ox,oy}=dragRef.current
      const dx=mm.x-sx, dy=mm.y-sy
      const nx=Math.round((ox+dx)/SNAP_MM)*SNAP_MM
      const ny=Math.round((oy+dy)/SNAP_MM)*SNAP_MM
      setEls(p=>p.map(el=>{
        if(el.id!==id) return el
        if(el.t==='line'){
          const bx=Math.min(el.x1,el.x2), by=Math.min(el.y1,el.y2)
          const ddx=nx-bx, ddy=ny-by
          return {...el,x1:el.x1+ddx,y1:el.y1+ddy,x2:el.x2+ddx,y2:el.y2+ddy}
        }
        return {...el,x:nx,y:ny}
      }))
    }
  }

  const onMouseUp=()=>{ dragRef.current=null }

  useEffect(()=>{
    const h=e=>{
      const tag=e.target.tagName
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return
      if((e.key==='Delete'||e.key==='Backspace')&&selId){
        setEls(p=>p.filter(el=>el.id!==selId)); setSelId(null)
      }
      if(e.key==='Escape'){setSelId(null);setTool('select')}
      const km={v:'select',t:'text',b:'barcode',q:'qr',r:'rect',l:'line'}
      if(!e.metaKey&&!e.ctrlKey&&km[e.key]) setTool(km[e.key])
    }
    window.addEventListener('keydown',h)
    return ()=>window.removeEventListener('keydown',h)
  },[selId])

  const selEl=els.find(e=>e.id===selId)
  const upd=useCallback(ch=>setEls(p=>p.map(el=>el.id===selId?{...el,...ch}:el)),[selId])
  const boundCount=useMemo(()=>els.filter(e=>e.bind).length,[els])

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',
      background:C.bg,color:C.text,overflow:'hidden',
      fontFamily:'"Helvetica Neue",Helvetica,Arial,sans-serif',fontSize:13}}>

      <TopBar zoom={zoom} setZoom={setZoom} grid={grid} setGrid={setGrid}
        elCount={els.length} boundCount={boundCount}/>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <Toolbox tool={tool} setTool={setTool} selId={selId}
          onDelete={()=>{setEls(p=>p.filter(e=>e.id!==selId));setSelId(null)}}/>

        <div style={{flex:1,overflow:'auto',background:C.bg,
          cursor:tool==='select'?'default':'crosshair'}}>
          <canvas ref={cvRef}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{display:'block'}}/>
        </div>

        <RightPanel panel={panel} setPanel={setPanel}
          selEl={selEl} upd={upd} els={els} hidden={hidden} setHidden={setHidden}
          setSelId={setSelId} boundCount={boundCount}/>
      </div>

      <StatusBar cursor={cursor} selEl={selEl} elCount={els.length} boundCount={boundCount}/>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOPBAR
   ═══════════════════════════════════════════════════════════════════════════ */
function TopBar({zoom,setZoom,grid,setGrid,elCount,boundCount}) {
  return (
    <div style={{height:46,background:C.panel,borderBottom:`1px solid ${C.border}`,
      display:'flex',alignItems:'center',padding:'0 8px',gap:2,flexShrink:0}}>

      {/* Brand */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginRight:8,
        paddingRight:10,borderRight:`1px solid ${C.border}`}}>
        <div style={{width:28,height:28,borderRadius:7,flexShrink:0,
          background:`linear-gradient(135deg,${C.teal} 0%,#006E5E 100%)`,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 16px ${C.tealGlow}`}}>
          <span style={{fontSize:10,fontWeight:900,color:'#011A15',
            fontFamily:'monospace',letterSpacing:'-0.5px'}}>LF</span>
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:C.text,
            lineHeight:1.1,letterSpacing:'-0.3px'}}>OMG</div>
          <div style={{fontSize:8.5,color:C.teal,fontWeight:700,
            letterSpacing:'0.14em',textTransform:'uppercase'}}>Studio</div>
        </div>
      </div>

      {['Open','Save','Print','Export'].map(l=>(
        <TBtnTop key={l} label={l}/>
      ))}
      <Divider/>
      <TBtnTop label="↩ Undo"/>
      <TBtnTop label="↪ Redo"/>
      <Divider/>

      <div style={{padding:'4px 10px',background:C.raised,border:`1px solid ${C.border}`,
        borderRadius:5,fontSize:11,color:C.muted,maxWidth:220,overflow:'hidden',
        textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        odette_transport_v1.lft
      </div>

      <div style={{flex:1}}/>

      <button onClick={()=>setGrid(g=>!g)} style={{
        display:'flex',alignItems:'center',gap:5,padding:'5px 10px',
        background:grid?C.tealDim:'none',
        border:`1px solid ${grid?C.tealMid:'transparent'}`,
        color:grid?C.teal:C.muted,cursor:'pointer',borderRadius:5,fontSize:11,
        transition:'all 0.15s'}}>
        ⊞ Grid
      </button>
      <Divider/>

      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <ZBtn onClick={()=>setZoom(z=>+(Math.max(0.3,z-0.1)).toFixed(2))}>−</ZBtn>
        <span style={{width:44,textAlign:'center',fontSize:11,color:C.dim,
          fontFamily:'monospace'}}>{Math.round(zoom*100)}%</span>
        <ZBtn onClick={()=>setZoom(z=>+(Math.min(4,z+0.1)).toFixed(2))}>+</ZBtn>
        <ZBtn onClick={()=>setZoom(1.1)} title="Fit"><span style={{fontSize:9}}>⊡</span></ZBtn>
      </div>
      <Divider/>

      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 11px',
        background:'#051210',border:`1px solid ${C.teal}25`,borderRadius:6}}>
        <span style={{width:5,height:5,borderRadius:'50%',background:C.teal,
          boxShadow:`0 0 6px ${C.teal}`,display:'inline-block'}}/>
        <span style={{fontSize:11,color:C.teal,fontWeight:600}}>parts.csv</span>
        <span style={{fontSize:10,color:C.muted}}>1,760 rows</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOOLBOX
   ═══════════════════════════════════════════════════════════════════════════ */
const TOOLS = [
  {id:'select',  label:'Select (V)',    glyph:'↖'},
  {id:'text',    label:'Text (T)',      glyph:'T'},
  {id:'barcode', label:'Barcode (B)',   glyph:'▦'},
  {id:'qr',      label:'QR Code (Q)',   glyph:'⊞'},
  {id:'rect',    label:'Rectangle (R)', glyph:'□'},
  {id:'line',    label:'Line (L)',      glyph:'╱'},
]

function Toolbox({tool,setTool,selId,onDelete}) {
  return (
    <div style={{width:46,background:C.panel,borderRight:`1px solid ${C.border}`,
      display:'flex',flexDirection:'column',alignItems:'center',
      padding:'8px 0',gap:2,flexShrink:0}}>
      {TOOLS.map(({id,label,glyph})=>(
        <ToolBtn key={id} active={tool===id} title={label} onClick={()=>setTool(id)}>
          <span style={{fontSize:id==='text'?14:id==='select'?13:12,
            fontWeight:id==='text'?700:400,lineHeight:1}}>{glyph}</span>
        </ToolBtn>
      ))}
      <div style={{flex:1}}/>
      <div style={{width:26,height:1,background:C.border,margin:'3px 0'}}/>
      {selId&&(
        <button title="Delete (Del)" onClick={onDelete}
          style={{width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',
            background:'none',border:`1px solid transparent`,borderRadius:8,
            color:C.red,cursor:'pointer',fontSize:15,transition:'all 0.13s'}}
          onMouseEnter={e=>{e.currentTarget.style.background=C.redDim;e.currentTarget.style.borderColor=C.red+'50'}}
          onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.borderColor='transparent'}}>
          ⌫
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIGHT PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function RightPanel({panel,setPanel,selEl,upd,els,hidden,setHidden,setSelId,boundCount}) {
  return (
    <div style={{width:270,background:C.panel,borderLeft:`1px solid ${C.border}`,
      display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden'}}>
      <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        {[{id:'props',label:'Properties'},{id:'layers',label:'Layers'}].map(({id,label})=>(
          <button key={id} onClick={()=>setPanel(id)} style={{
            flex:1,padding:'9px 0',background:'none',border:'none',
            borderBottom:`2px solid ${panel===id?C.teal:'transparent'}`,
            color:panel===id?C.teal:C.muted,cursor:'pointer',fontSize:11,
            fontWeight:panel===id?700:400,letterSpacing:'0.03em',transition:'all 0.15s'}}>
            {label}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        {panel==='props'
          ? <PropsPanel el={selEl} upd={upd} els={els} boundCount={boundCount}/>
          : <LayersPanel els={els} selId={selEl?.id} setSelId={setSelId}
              hidden={hidden} setHidden={setHidden}/>
        }
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROPERTIES PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function PropsPanel({el,upd,els,boundCount}) {
  if(!el) return (
    <div style={{padding:16}}>
      <div style={{textAlign:'center',margin:'26px 0 20px'}}>
        <div style={{fontSize:28,opacity:0.12,marginBottom:10}}>↖</div>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.7,margin:0}}>
          Select an element<br/>to edit its properties
        </p>
      </div>
      <Card title="Label Info">
        <InfoRow k="Template"    v="Odette Transport v1"/>
        <InfoRow k="Size"        v="148 × 105 mm"/>
        <InfoRow k="Standard"    v="Odette / GS1"/>
        <InfoRow k="Elements"    v={els.length}/>
        <InfoRow k="Bound fields"v={<span style={{color:C.teal,fontWeight:700}}>{boundCount}</span>}/>
        <InfoRow k="Data source" v="parts.csv · 1,760"/>
      </Card>
      <div style={{marginTop:12,padding:'10px 12px',background:'#051210',
        border:`1px solid ${C.teal}1E`,borderRadius:8}}>
        <div style={{fontSize:9,fontWeight:700,color:C.teal,letterSpacing:'0.1em',
          textTransform:'uppercase',marginBottom:6}}>Quick tips</div>
        <p style={{fontSize:11,color:C.muted,lineHeight:1.65,margin:0}}>
          Cyan dots = data-bound fields. Press&nbsp;
          <Kbd>V</Kbd> select · <Kbd>T</Kbd> text · <Kbd>Del</Kbd> delete · <Kbd>Esc</Kbd> deselect.
        </p>
      </div>
    </div>
  )

  return (
    <div>
      {/* header */}
      <div style={{padding:'9px 14px',borderBottom:`1px solid ${C.border}`,
        display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:9.5,fontWeight:700,padding:'3px 8px',
            background:C.tealDim,color:C.teal,borderRadius:4,
            border:`1px solid ${C.tealMid}`,textTransform:'uppercase',letterSpacing:'0.07em'}}>
            {el.t}
          </span>
          {el.bind&&<span style={{fontSize:9,color:C.teal,display:'flex',alignItems:'center',gap:3}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:C.teal,display:'inline-block'}}/>
            Bound
          </span>}
        </div>
        <span style={{fontSize:9,color:C.muted,fontFamily:'monospace',
          overflow:'hidden',textOverflow:'ellipsis',maxWidth:100,whiteSpace:'nowrap'}}>{el.id}</span>
      </div>

      {/* position & size */}
      <Sec title="Position & Size">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
          <NF label="X (mm)" val={el.t==='line'?el.x1:el.x} step={0.5} onChange={v=>upd(el.t==='line'?{x1:v}:{x:v})}/>
          <NF label="Y (mm)" val={el.t==='line'?el.y1:el.y} step={0.5} onChange={v=>upd(el.t==='line'?{y1:v}:{y:v})}/>
          <NF label="W (mm)" val={el.w??Math.abs((el.x2||0)-(el.x1||0))} step={0.5} onChange={v=>upd({w:v})}/>
          <NF label="H (mm)" val={el.h??Math.abs((el.y2||0)-(el.y1||0))} step={0.5} onChange={v=>upd({h:v})}/>
        </div>
      </Sec>

      {el.t==='text'&&(
        <Sec title="Typography">
          <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:9}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <PL>Font size (mm)</PL>
                <input type="number" value={el.fz} step="0.5" min="1" max="25"
                  onChange={e=>upd({fz:+e.target.value})} style={IS}
                  onFocus={e=>e.target.style.borderColor=C.teal+'70'}
                  onBlur={e=>e.target.style.borderColor=C.border}/>
              </div>
              <div>
                <PL>Color</PL>
                <div style={{display:'flex',gap:4}}>
                  <input type="color" value={el.color||'#111111'} onChange={e=>upd({color:e.target.value})}
                    style={{width:28,height:28,border:`1px solid ${C.border}`,borderRadius:5,
                      background:C.raised,cursor:'pointer',padding:2,flexShrink:0}}/>
                  <input type="text" value={el.color||'#111111'} onChange={e=>upd({color:e.target.value})}
                    style={{...IS,fontFamily:'monospace',fontSize:10}}
                    onFocus={e=>e.target.style.borderColor=C.teal+'70'}
                    onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
              </div>
            </div>
            <div>
              <PL>Alignment</PL>
              <div style={{display:'flex',gap:3}}>
                {[['left','Left'],['center','Center'],['right','Right']].map(([v,l])=>(
                  <button key={v} onClick={()=>upd({align:v})} style={{
                    flex:1,padding:'5px 0',fontSize:10,
                    background:el.align===v?C.tealDim:C.raised,
                    border:`1px solid ${el.align===v?C.tealMid:C.border}`,
                    color:el.align===v?C.teal:C.muted,borderRadius:5,cursor:'pointer',
                    transition:'all 0.12s'}}>{l}</button>
                ))}
              </div>
            </div>
            <button onClick={()=>upd({bold:!el.bold})} style={{
              display:'flex',alignItems:'center',gap:6,padding:'6px 10px',
              background:el.bold?C.tealDim:C.raised,
              border:`1px solid ${el.bold?C.tealMid:C.border}`,
              borderRadius:5,color:el.bold?C.teal:C.muted,cursor:'pointer',
              fontSize:11,fontWeight:el.bold?700:400,transition:'all 0.12s'}}>
              <b>B</b> Bold
            </button>
            <div>
              <PL>Value</PL>
              <textarea value={el.value||''} onChange={e=>upd({value:e.target.value})} rows={2}
                style={{...IS,resize:'vertical',lineHeight:1.5,fontFamily:'inherit'}}
                onFocus={e=>e.target.style.borderColor=C.teal+'70'}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
          </div>
        </Sec>
      )}

      {el.t==='barcode'&&(
        <Sec title="Barcode">
          <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:9}}>
            <div>
              <PL>Symbology</PL>
              <select value={el.sym||'code128'} onChange={e=>upd({sym:e.target.value})}
                style={{...IS,cursor:'pointer'}}>
                {['code128','code39','ean13','ean8','itf14','gs1_128','datamatrix','pdf417','codabar'].map(s=>(
                  <option key={s} value={s}>{s.toUpperCase().replace('_','-')}</option>
                ))}
              </select>
            </div>
            <div>
              <PL>Value</PL>
              <input type="text" value={el.value||''} onChange={e=>upd({value:e.target.value})}
                style={{...IS,fontFamily:'monospace'}}
                onFocus={e=>e.target.style.borderColor=C.teal+'70'}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
          </div>
        </Sec>
      )}

      {el.t==='qrcode'&&(
        <Sec title="QR Code">
          <div style={{padding:'8px 12px'}}>
            <PL>Data payload</PL>
            <textarea value={el.value||''} onChange={e=>upd({value:e.target.value})} rows={3}
              style={{...IS,fontFamily:'monospace',fontSize:10,resize:'vertical',lineHeight:1.55}}
              onFocus={e=>e.target.style.borderColor=C.teal+'70'}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        </Sec>
      )}

      {el.t==='rect'&&(
        <Sec title="Style">
          <div style={{padding:'8px 12px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>
              <PL>Stroke</PL>
              <input type="color" value={el.stroke||'#000000'} onChange={e=>upd({stroke:e.target.value})}
                style={{width:'100%',height:28,border:`1px solid ${C.border}`,borderRadius:5,
                  background:C.raised,cursor:'pointer',padding:2}}/>
            </div>
            <div>
              <PL>Fill</PL>
              <input type="color" value={el.fill&&el.fill!=='none'?el.fill:'#ffffff'}
                onChange={e=>upd({fill:e.target.value})}
                style={{width:'100%',height:28,border:`1px solid ${C.border}`,borderRadius:5,
                  background:C.raised,cursor:'pointer',padding:2}}/>
            </div>
          </div>
        </Sec>
      )}

      {/* Data Binding */}
      <Sec title="Data Binding">
        <div style={{padding:'8px 12px'}}>
          {el.bind?(
            <div style={{background:'#051210',border:`1px solid ${C.teal}28`,borderRadius:8,
              padding:'10px 12px',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:9,fontWeight:700,color:C.teal,letterSpacing:'0.1em',
                    textTransform:'uppercase',marginBottom:4}}>Bound column</div>
                  <div style={{fontSize:13,color:C.text,fontFamily:'monospace',fontWeight:700,
                    display:'flex',alignItems:'center',gap:7}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:C.teal,
                      boxShadow:`0 0 7px ${C.teal}`,display:'inline-block'}}/>
                    {el.bind.col}
                  </div>
                </div>
                <button onClick={()=>upd({bind:null})} style={{fontSize:10,color:C.red,
                  background:C.redDim,border:`1px solid ${C.red}40`,padding:'4px 9px',
                  borderRadius:4,cursor:'pointer'}}>Unbind</button>
              </div>
            </div>
          ):(
            <div style={{background:C.raised,border:`1px dashed ${C.border}`,borderRadius:8,
              padding:'9px 12px',marginBottom:10,fontSize:11,color:C.muted}}>
              ⊘ No binding — using static value
            </div>
          )}
          <div style={{fontSize:9,color:C.muted,marginBottom:5,textTransform:'uppercase',
            letterSpacing:'0.09em',fontWeight:700}}>Available columns</div>
          {DATA_COLS.map(col=>{
            const active=el.bind?.col===col
            return (
              <button key={col} onClick={()=>upd({bind:{col}})} style={{
                display:'flex',alignItems:'center',justifyContent:'space-between',
                width:'100%',textAlign:'left',padding:'6px 9px',marginBottom:2,
                background:active?C.tealDim:C.raised,
                border:`1px solid ${active?C.tealMid:C.border}`,
                borderRadius:5,color:active?C.teal:C.dim,cursor:'pointer',
                fontSize:11,fontFamily:'monospace',transition:'all 0.12s'}}
                onMouseEnter={e=>{if(!active){e.currentTarget.style.background=C.faint}}}
                onMouseLeave={e=>{if(!active){e.currentTarget.style.background=C.raised}}}>
                <span>{col}</span>
                {active&&<span style={{fontSize:8,background:C.tealDim,padding:'2px 5px',
                  borderRadius:3,color:C.teal,fontFamily:'sans-serif',fontWeight:700}}>BOUND</span>}
              </button>
            )
          })}
        </div>
      </Sec>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LAYERS PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function LayersPanel({els,selId,setSelId,hidden,setHidden}) {
  const toggle=id=>setHidden(p=>({...p,[id]:!p[id]}))
  const typeGlyph={text:'T',barcode:'▦',qrcode:'⊞',rect:'□',line:'╱'}
  return (
    <div style={{padding:6}}>
      <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:'0.1em',
        textTransform:'uppercase',padding:'4px 7px 8px'}}>
        {els.length} elements
      </div>
      {[...els].reverse().map(el=>{
        const b=elBounds(el)
        const vis=!hidden[el.id]
        return (
          <div key={el.id} onClick={()=>setSelId(el.id)} style={{
            display:'flex',alignItems:'center',gap:6,padding:'5px 7px',
            borderRadius:6,marginBottom:1,cursor:'pointer',
            background:selId===el.id?C.tealDim:'none',
            border:`1px solid ${selId===el.id?C.tealMid:'transparent'}`,
            opacity:vis?1:0.3,transition:'all 0.1s'}}
            onMouseEnter={e=>{if(selId!==el.id)e.currentTarget.style.background=C.raised}}
            onMouseLeave={e=>{if(selId!==el.id)e.currentTarget.style.background='none'}}>
            <span style={{fontSize:10,color:selId===el.id?C.teal:C.muted,
              fontFamily:'monospace',width:14,textAlign:'center',flexShrink:0}}>
              {typeGlyph[el.t]||'?'}
            </span>
            <div style={{flex:1,overflow:'hidden',minWidth:0}}>
              <div style={{fontSize:10,color:selId===el.id?C.teal:C.dim,
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {el.id}
              </div>
              <div style={{fontSize:9,color:C.muted}}>
                {b.w.toFixed(0)}×{b.h.toFixed(0)} mm
              </div>
            </div>
            {el.bind&&<span style={{width:5,height:5,borderRadius:'50%',
              background:C.teal,boxShadow:`0 0 5px ${C.teal}`,flexShrink:0}}/>}
            <button onClick={e=>{e.stopPropagation();toggle(el.id)}} style={{
              background:'none',border:'none',color:vis?C.dim:C.muted,
              cursor:'pointer',padding:2,fontSize:11,lineHeight:1,flexShrink:0}}>
              {vis?'◉':'○'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════════════════ */
function StatusBar({cursor,selEl,elCount,boundCount}) {
  return (
    <div style={{height:22,background:'#040810',borderTop:`1px solid ${C.border}`,
      display:'flex',alignItems:'center',padding:'0 12px',gap:16,flexShrink:0}}>
      <span style={{display:'flex',alignItems:'center',gap:5}}>
        <span style={{width:5,height:5,borderRadius:'50%',background:C.green,
          boxShadow:`0 0 5px ${C.green}`,display:'inline-block'}}/>
        <span style={{fontSize:10,color:C.muted}}>Ready</span>
      </span>
      {selEl&&<span style={{fontSize:10,color:C.muted}}>{selEl.t.toUpperCase()} · {selEl.id}</span>}
      <span style={{fontSize:10,color:C.muted,fontFamily:'monospace'}}>
        {cursor.x} mm,  {cursor.y} mm
      </span>
      <div style={{flex:1}}/>
      <span style={{fontSize:10,color:C.muted}}>
        148×105 mm · Odette A6 · {elCount} elements · {boundCount} bound · OMG v1.0
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED MICRO-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */
const IS = {  // input style
  width:'100%', background:C.raised, border:`1px solid ${C.border}`,
  borderRadius:5, padding:'5px 8px', color:C.text, fontSize:11,
  outline:'none', boxSizing:'border-box', transition:'border-color 0.12s',
}

function Divider() { return <div style={{width:1,height:24,background:C.border,margin:'0 4px'}}/> }

function Sec({title,children}) {
  return (
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      <div style={{padding:'7px 14px 4px',fontSize:9.5,fontWeight:700,color:C.muted,
        textTransform:'uppercase',letterSpacing:'0.09em'}}>{title}</div>
      {children}
    </div>
  )
}

function Card({title,children}) {
  return (
    <div style={{background:C.raised,borderRadius:9,border:`1px solid ${C.border}`,overflow:'hidden'}}>
      <div style={{padding:'7px 12px',fontSize:9.5,fontWeight:700,color:C.muted,
        textTransform:'uppercase',letterSpacing:'0.09em',borderBottom:`1px solid ${C.border}`}}>
        {title}
      </div>
      <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:6}}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({k,v}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:11,color:C.muted}}>{k}</span>
      <span style={{fontSize:11,color:C.dim,fontFamily:'monospace'}}>{v}</span>
    </div>
  )
}

function PL({children}) { // PropLabel
  return <div style={{fontSize:9.5,color:C.muted,marginBottom:3,fontWeight:500}}>{children}</div>
}

function Kbd({children}) {
  return (
    <span style={{fontSize:9,background:C.raised,border:`1px solid ${C.border2}`,
      borderRadius:3,padding:'1px 5px',color:C.dim,fontFamily:'monospace'}}>
      {children}
    </span>
  )
}

function NF({label,val,step,onChange}) { // NumField
  return (
    <div style={{padding:'5px 8px'}}>
      <PL>{label}</PL>
      <input type="number" value={typeof val==='number'?+val.toFixed(1):val} step={step}
        onChange={e=>onChange(+e.target.value)} style={{...IS,fontVariantNumeric:'tabular-nums'}}
        onFocus={e=>e.target.style.borderColor=C.teal+'70'}
        onBlur={e=>e.target.style.borderColor=C.border}/>
    </div>
  )
}

function TBtnTop({label,onClick}) {
  const [hov,setHov]=useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:'flex',alignItems:'center',gap:5,padding:'5px 9px',
        background:hov?C.raised:'none',border:`1px solid ${hov?C.border:'transparent'}`,
        color:hov?C.dim:C.muted,cursor:'pointer',borderRadius:5,fontSize:11,
        transition:'all 0.12s'}}>
      {label}
    </button>
  )
}

function ZBtn({onClick,title,children}) {
  return (
    <button onClick={onClick} title={title}
      style={{width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',
        background:C.raised,border:`1px solid ${C.border}`,borderRadius:5,
        color:C.dim,cursor:'pointer',fontSize:14}}>
      {children}
    </button>
  )
}

function ToolBtn({active,title,onClick,children}) {
  const [hov,setHov]=useState(false)
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',
        background:active?C.tealDim:hov?C.raised:'none',
        border:`1px solid ${active?C.tealMid:hov?C.border:'transparent'}`,
        borderRadius:8,color:active?C.teal:hov?C.dim:C.muted,
        cursor:'pointer',transition:'all 0.12s'}}>
      {children}
    </button>
  )
}
