import sys, pathlib, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
floors=sys.argv[1].split(','); x0,y0,x1,y1=map(float,sys.argv[2:6]); out=sys.argv[6]; lab=len(sys.argv)>7
fig,ax=plt.subplots(figsize=(18,18*(y1-y0)/(x1-x0)))
cols={'terra':'tab:blue','int':'tab:red'}
for f in floors:
    seen={}
    for L in load_vector_lines(f):
        P=np.array(L['pts']); c=cols[f] if len(floors)>1 else plt.cm.tab10.colors[L['id']%10]
        ax.plot(P[:,0],P[:,1],color=c,lw=0.8)
        seen.setdefault(L['id'],[]).append(P)
    if lab:
        for i,Ps in seen.items():
            P=np.vstack(Ps); cx,cy=P.mean(0)
            if x0<cx<x1 and y0<cy<y1: ax.text(cx,cy,str(i),fontsize=7,color=plt.cm.tab10.colors[i%10],ha='center')
ax.set_xlim(x0,x1); ax.set_ylim(y1,y0); ax.set_aspect('equal')
ax.set_xticks(np.arange(np.ceil(x0/100)*100,x1,100)); ax.set_yticks(np.arange(np.ceil(y0/100)*100,y1,100)); ax.grid(True,lw=0.4)
fig.savefig(out,dpi=80,bbox_inches='tight')
