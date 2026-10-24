// Original main rolling behavior: one item every 3s, 400ms jQuery-style swing.
export function initMainCarousel(container,dialog){
 if(!container)return;
 const track=container.querySelector('#sliderInner'),viewport=container.querySelector('.slider_inner'),play=container.querySelector(':scope > .play'),stop=container.querySelector(':scope > .stop');
 const originals=[...track.children],reduced=matchMedia('(prefers-reduced-motion: reduce)');if(!originals.length)return;
 let paused=reduced.matches,hovering=false,moving=false,frame=0,timer=0,stepWidth=274;
 const firstOn=Math.max(0,originals.findIndex(li=>li.classList.contains('on'))),start=(firstOn-3+originals.length)%originals.length;
 track.replaceChildren(...originals.slice(start),...originals.slice(0,start));track.classList.remove('slide4','slide5');
 if(originals.length>3&&originals.length<9){const ordered=[...track.children];for(let n=track.children.length;n<12;n++)track.append(ordered[n%ordered.length].cloneNode(true));}
 for(const li of track.children){li.style.order='0';const a=li.querySelector('a');if(!a)continue;const enter=()=>{if(li.classList.contains('on'))a.classList.add('hover');};a.addEventListener('mouseenter',enter);a.addEventListener('focus',enter);a.addEventListener('mouseleave',()=>a.classList.remove('hover'));a.addEventListener('blur',()=>a.classList.remove('hover'));}
 const offset=originals.length<=3?0:4;
 function position(x){track.style.transform=`translate3d(${x}px,0,0)`;}
 function highlight(){[...track.children].forEach((li,i)=>{li.classList.toggle('on',originals.length<=3||(i>=3&&i<6));li.querySelector('a')?.classList.remove('hover');});}
 function layout(){cancelAnimationFrame(frame);moving=false;container.classList.remove('is-moving');stepWidth=track.firstElementChild.getBoundingClientRect().width;viewport.style.width=stepWidth+'px';viewport.style.margin='0 auto';if(originals.length<=3)position(-(originals.length-1)*stepWidth/2);else position(-offset*stepWidth);highlight();container.classList.add('carousel-ready');}
 function step(direction){if(moving||originals.length<=3)return;moving=true;container.classList.add('is-moving');const from=-offset*stepWidth,to=from-direction*stepWidth;if(direction<0){track.prepend(track.lastElementChild);position(from-stepWidth);}const begin=performance.now(),base=direction>0?from:from-stepWidth,target=direction>0?to:from,duration=reduced.matches?0:400;
  function finish(){if(direction>0)track.append(track.firstElementChild);position(from);highlight();moving=false;container.classList.remove('is-moving');}
  if(!duration){finish();return;}
  function tick(now){const progress=Math.min(1,(now-begin)/duration),swing=(1-Math.cos(Math.PI*progress))/2;position(base+(target-base)*swing);if(progress<1)frame=requestAnimationFrame(tick);else finish();}frame=requestAnimationFrame(tick);
 }
 function playback(){play.style.display=paused?'block':'none';stop.style.display=paused?'none':'block';}
 function schedule(){clearInterval(timer);if(!paused&&!hovering&&!document.hidden&&originals.length>3)timer=setInterval(()=>{if(!dialog?.open&&!track.contains(document.activeElement))step(1);},3000);}
 container.querySelector(':scope > .prev').addEventListener('click',e=>{e.preventDefault();step(-1);});container.querySelector(':scope > .next').addEventListener('click',e=>{e.preventDefault();step(1);});
 play.addEventListener('click',e=>{e.preventDefault();paused=false;playback();schedule();});stop.addEventListener('click',e=>{e.preventDefault();paused=true;playback();schedule();});
 track.addEventListener('mouseenter',()=>{hovering=true;schedule();});track.addEventListener('mouseleave',()=>{hovering=false;schedule();});document.addEventListener('visibilitychange',schedule);
 window.addEventListener('resize',layout);reduced.addEventListener('change',()=>{paused=reduced.matches;layout();playback();schedule();});layout();playback();schedule();
 if(originals.length<=3)for(const c of [play,stop,container.querySelector(':scope > .prev'),container.querySelector(':scope > .next')])c.style.display='none';
}
