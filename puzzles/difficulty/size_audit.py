# Size and ceiling audit (research review 2026-10-24, idea 2): within type on Puzzle Square JP, what
# the cell count alone scores against the rating, and how well puzz.link's raters agree with PSJP's
# on the same puzzles (the inter-rater line), with cells beside each.
#
#   python3 -I size_audit.py <psjp-full/converted/> <psjp/puzzlink-psjp.json>
import json,collections,random,sys,os
from statistics import mean
def rank(x):
    o=sorted(range(len(x)),key=lambda i:x[i]); r=[0]*len(x); i=0
    while i<len(o):
        j=i
        while j+1<len(o) and x[o[j+1]]==x[o[i]]: j+=1
        for k in range(i,j+1): r[o[k]]=(i+j)/2
        i=j+1
    return r
def sp(a,b):
    ra,rb=rank(a),rank(b); ma,mb=mean(ra),mean(rb)
    num=sum((x-ma)*(y-mb) for x,y in zip(ra,rb)); den=(sum((x-ma)**2 for x in ra)*sum((y-mb)**2 for y in rb))**.5
    return num/den if den else float('nan')
def boot(a,b,n=500):
    random.seed(1); idx=range(len(a)); v=[]
    for _ in range(n):
        s=[random.choice(idx) for _ in idx]; v.append(sp([a[i] for i in s],[b[i] for i in s]))
    v.sort(); return v[int(.025*n)],v[int(.975*n)]
print("PSJP rated puzzles, all of psjp-full (variation 0): Spearman of cell count with the PSJP rating, within type")
tot=[]
for t in ['akari','hitori','masyu','simple-loop','slitherlink']:
    rows=[json.loads(l) for l in open(os.path.join(sys.argv[1],t+'.jsonl'))]
    rows=[r for r in rows if r['meta'].get('difficulty') is not None and r['meta'].get('variation',0)==0]
    cells=[r['spec']['size'][0]*r['spec']['size'][1] for r in rows]; dif=[r['meta']['difficulty'] for r in rows]
    rho=sp(cells,dif); lo,hi=boot(cells,dif,200); tot.append((rho,len(rows)))
    print(f"  {t:12} n={len(rows):5}  cells {rho:.2f} ({lo:.2f}, {hi:.2f})  distinct sizes {len(set(cells))}")
print(f"  n-weighted {sum(r*n for r,n in tot)/sum(n for r,n in tot):.2f}")
# inter-rater: puzz.link's rating vs PSJP's on the same puzzles
pl=json.load(open(sys.argv[2]))
import glob,re
def norm(link): 
    m=re.search(r'\?(.*)$',link or ''); return m.group(1) if m else (link or '')
psjp={}
for f in glob.glob(os.path.join(sys.argv[1],'*.jsonl')):
    for l in open(f):
        r=json.loads(l); m=r['meta']
        if m.get('difficulty') is None: continue
        psjp[norm(m.get('link'))]=(r['genre'],m['difficulty'],r['spec']['size'][0]*r['spec']['size'][1])
pairs=collections.defaultdict(list)
for r in pl:
    k=norm(r.get('pzv_override') or r.get('pzv'))
    k2=r.get('pzv')
    hit=psjp.get(k) or psjp.get(k2)
    if hit and r.get('difficulty') is not None: pairs[hit[0]].append((r['difficulty'],hit[1],hit[2]))
print("\npuzz.link rating vs PSJP rating on the same puzzles (inter-rater), and cells with each")
tw=[]
for g,v in sorted(pairs.items(),key=lambda x:-len(x[1])):
    if len(v)<20: continue
    a,b,c=zip(*v); tw.append((sp(a,b),sp(c,b),sp(c,a),len(v)))
    print(f"  {g:14} n={len(v):4}  raters {sp(a,b):.2f}  cells~PSJP {sp(c,b):.2f}  cells~puzz.link {sp(c,a):.2f}")
N=sum(x[3] for x in tw)
print(f"  n-weighted raters {sum(x[0]*x[3] for x in tw)/N:.2f}  cells~PSJP {sum(x[1]*x[3] for x in tw)/N:.2f}")
