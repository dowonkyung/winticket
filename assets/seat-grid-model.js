export function resizeZone(source,rows,columns,gradeId){
 if(!Number.isInteger(rows)||rows<1||rows>80||!Number.isInteger(columns)||columns<1||columns>100||!gradeId)throw new Error('행 1~80, 열 1~100 및 좌석등급을 확인해 주세요.');
 const z=structuredClone(source),previous=new Map(z.seats.map(s=>[s.row+':'+s.col,s])),empty=!z.seats.length;z.rows=rows;z.columns=columns;z.seats=[];const usedIds=new Set(source.seats.map(s=>s.id));
 for(let row=1;row<=rows;row++){
  const labels=new Set(source.seats.filter(s=>s.row===row&&s.col<=columns).map(s=>s.number));
  for(let col=1;col<=columns;col++){
   const old=previous.get(row+':'+col);if(old){z.seats.push(structuredClone(old));continue;}
   if(!empty&&row<=source.rows&&col<=source.columns){const oldStart=source.layout==='triangle'?Math.max(1,Math.round(source.columns*(1-Math.min(1,(row-1)/Math.max(1,source.rows*.6))))):1;if(col>=oldStart)continue;}
   const start=z.layout==='triangle'?Math.max(1,Math.round(columns*(1-Math.min(1,(row-1)/Math.max(1,rows*.6))))):1;if(col<start)continue;
   let n=col;while(labels.has(String(n)))n++;labels.add(String(n));let id=z.id+'-'+row+'-'+col,i=1;while(usedIds.has(id))id=z.id+'-'+row+'-'+col+'-new'+i++;usedIds.add(id);
   z.seats.push({id,row,col,number:String(n),gradeId,blocked:false});
  }
 }return z;
}
