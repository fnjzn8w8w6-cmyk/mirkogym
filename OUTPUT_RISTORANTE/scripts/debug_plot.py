import json, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
def bez(p0,p1,p2,p3,n=12):
    t=np.linspace(0,1,n)[:,None]; P=[np.array(x) for x in (p0,p1,p2,p3)]
    return (1-t)**3*P[0]+3*(1-t)**2*t*P[1]+3*(1-t)*t**2*P[2]+t**3*P[3]
def path_lines(p):
    L=[]
    for s in p['segs']:
        if s[0]=='l': L.append(np.array([s[1],s[2]]))
        elif s[0]=='c': L.append(bez(*s[1:]))
        else: L.append(np.array(s[1:]+[s[1]]))
    return L
if __name__=='__main__':
    k=sys.argv[1]; x0,y0,x1,y1=map(float,sys.argv[2:6]); out=sys.argv[6]
    d=json.load(open(f'dati/vettori_{k}.json'))
    fig,ax=plt.subplots(figsize=(16,16*(y1-y0)/(x1-x0)))
    cols=plt.cm.tab10.colors
    for p in d['paths']:
        c=cols[p['id']%10]
        pts=[]
        for L in path_lines(p):
            ax.plot(L[:,0],L[:,1],color=c,lw=0.8); pts.append(L)
        P=np.vstack(pts); cx,cy=P.mean(0)
        if x0<cx<x1 and y0<cy<y1: ax.text(cx,cy,str(p['id']),fontsize=7,color=c,ha='center')
    ax.set_xlim(x0,x1); ax.set_ylim(y1,y0); ax.set_aspect('equal'); ax.grid(True,lw=0.3)
    ax.set_xticks(np.arange(int(x0)//10*10,x1,10),minor=True)
    fig.savefig(out,dpi=90,bbox_inches='tight')
