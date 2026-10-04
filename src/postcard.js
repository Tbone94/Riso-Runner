// postcard.js — the end of a run, printed as a postcard: the moment it ended, on paper, with where you
// were, how far you got and how much ink you gathered. Returns a 1500×1000 canvas.
const STENCIL='"Big Shoulders Stencil Display", Impact, sans-serif',MONO='"Cutive Mono", "Courier New", monospace';

function rng(seed){let s=(Math.imul(seed|0,2654435761)>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

// snap: a canvas of the frame; inks: [light, mid, key] as #hex; paper: #hex
export function postcard({snap,region,metres,ink,runNo,best,inks,paper,why}){
  const W=1500,H=1000,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),r=rng(runNo*31+metres);
  x.fillStyle=paper;x.fillRect(0,0,W,H);
  // paper fibre: faint specks of dark and light
  for(let i=0;i<9000;i++){x.fillStyle=r()<.5?'rgba(60,40,20,.05)':'rgba(255,255,255,.18)';x.fillRect(r()*W,r()*H,1+r()*1.5,1+r()*1.5);}
  // the picture (3:2, cropped from the frame's centre), with a ragged printed edge
  const PX=60,PY=60,PW=960,PH=640;
  x.save();x.beginPath();const jag=(n,f)=>{for(let i=0;i<=n;i++)f(i/n,(r()-.5)*5);};
  jag(60,(t,j)=>x.lineTo(PX+t*PW,PY+j));jag(40,(t,j)=>x.lineTo(PX+PW+j,PY+t*PH));jag(60,(t,j)=>x.lineTo(PX+PW-t*PW,PY+PH+j));jag(40,(t,j)=>x.lineTo(PX+j,PY+PH-t*PH));
  x.closePath();x.clip();
  const sa=snap.width/snap.height,fa=PW/PH;let sw=snap.width,sh=snap.height,sx=0,sy=0;if(sa>fa){sw=sh*fa;sx=(snap.width-sw)/2;}else{sh=sw/fa;sy=(snap.height-sh)/2;}
  x.drawImage(snap,sx,sy,sw,sh,PX,PY,PW,PH);x.restore();
  // crop marks round the picture
  x.strokeStyle=inks[2];x.lineWidth=2;
  for(const[cx,cy,dx,dy]of[[PX,PY,-1,-1],[PX+PW,PY,1,-1],[PX,PY+PH,-1,1],[PX+PW,PY+PH,1,1]]){x.beginPath();x.moveTo(cx+dx*10,cy);x.lineTo(cx+dx*34,cy);x.moveTo(cx,cy+dy*10);x.lineTo(cx,cy+dy*34);x.stroke();}
  // the region, big, in the mid ink with the key outline printed a touch out of register
  x.textBaseline='alphabetic';x.font=`900 190px ${STENCIL}`;const word=region.toUpperCase();
  x.globalCompositeOperation='multiply';x.fillStyle=inks[1];x.fillText(word,PX,PY+PH+215);
  x.strokeStyle=inks[2];x.lineWidth=4;x.strokeText(word,PX+5,PY+PH+219);x.globalCompositeOperation='source-over';
  // the right-hand column
  const CX=1080;x.fillStyle=inks[2];
  x.font=`900 64px ${STENCIL}`;x.fillText('RISO',CX,124);x.fillText('RUNNER',CX,188);
  x.font=`26px ${MONO}`;x.fillText(`run ${runNo}`,CX,232);
  x.fillRect(CX,262,350,3);
  x.font=`900 136px ${STENCIL}`;x.fillText(`${metres}`,CX,410);x.font=`900 44px ${STENCIL}`;x.fillText('METRES',CX,462);
  x.font=`28px ${MONO}`;x.fillText(`${ink} ink gathered`,CX,520);
  if(why)x.fillText(why,CX,560);
  x.fillText(metres>=best?'a new best!':`best: ${best} m`,CX,600);
  // the three inks, overprinted like a colour bar
  x.globalCompositeOperation='multiply';
  inks.forEach((h,i)=>{x.fillStyle=h;x.beginPath();x.arc(CX+40+i*52,690,38,0,Math.PI*2);x.fill();});
  x.globalCompositeOperation='source-over';
  x.fillStyle=inks[2];x.font=`24px ${MONO}`;
  x.fillText(new Date().toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}),CX,PY+PH+215);
  return c;
}
