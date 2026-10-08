"""Plot di debug in coordinate metriche (cm) ruotate sull'asse principale del locale."""
import json, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from debug_plot import path_lines
def to_local(P, mm_per_pt, ang_deg, origin):
    a=np.radians(ang_deg); R=np.array([[np.cos(a),np.sin(a)],[-np.sin(a),np.cos(a)]])
    return ((np.asarray(P)-origin)@R.T)*mm_per_pt/10.0   # cm, y down
if __name__=='__main__':
    k=sys.argv[1]; mm=float(sys.argv[2]); ang=float(sys.argv[3]); ox,oy=float(sys.argv[4]),float(sys.argv[5])
    x0,y0,x1,y1=map(float,sys.argv[6:10]); out=sys.argv[10]
    d=json.load(open(f'dati/vettori_{k}.json'))
    fig,ax=plt.subplots(figsize=(18,18*(y1-y0)/(x1-x0)))
    cols=plt.cm.tab10.colors
    for p in d['paths']:
        c=cols[p['id']%10]; pts=[]
        for L in path_lines(p):
            Q=to_local(L,mm,ang,(ox,oy)); ax.plot(Q[:,0],Q[:,1],color=c,lw=0.9); pts.append(Q)
        P=np.vstack(pts); cx,cy=P.mean(0)
        if x0<cx<x1 and y0<cy<y1: ax.text(cx,cy,str(p['id']),fontsize=7,color=c,ha='center')
    ax.set_xlim(x0,x1); ax.set_ylim(y1,y0); ax.set_aspect('equal')
    ax.set_xticks(np.arange(np.ceil(x0/100)*100,x1,100)); ax.set_yticks(np.arange(np.ceil(y0/100)*100,y1,100))
    ax.grid(True,lw=0.4)
    fig.savefig(out,dpi=80,bbox_inches='tight')
