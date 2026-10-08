// Esporta la scena della vista 3D (OUTPUT/3D/vista_3d.html) in GLB per il rendering in Blender,
// con le posizioni delle luci e il percorso del tour campionato.
// Uso: node esporta_scena.cjs <pagina_locale.html> <GLTFExporter.js> <cartella_uscita> [fps]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [page, exporter, out, fps = '25'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + page); await p.waitForTimeout(4000);
  await p.addScriptTag({ path: exporter });
  const res = await p.evaluate(async (fps) => {
    for (const [k, m] of Object.entries(MAT)) m.name = k;
    for (const [k, m] of Object.entries(ESTERNO)) if (m && m.isMaterial) m.name = 'est_' + k;
    const skip = new Set([M_POOL, M_POOLF, M_SHADOW, M_AO, M_WASH]);
    const out = new THREE.Scene(); let n = 0;
    const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = (name || mat.name || 'misc') + '_' + (n++); out.add(m); };
    for (const root of [G.PT, G.S1, G.fuori]) {
      root.updateMatrixWorld(true);
      root.traverse(o => {
        if (!o.isMesh || o.isSprite) return;
        const mat = o.material;
        if (Array.isArray(mat) || skip.has(mat) || mat.blending === THREE.AdditiveBlending) return;
        if (!mat.name) mat.name = mat.isMeshBasicMaterial ? 'basic' : 'misc';
        if (o.isInstancedMesh) {
          const parts = []; const mtx = new THREE.Matrix4(); const col = new THREE.Color();
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, mtx); const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, mtx));
            const q = g.index ? g.toNonIndexed() : g;
            if (o.instanceColor) { col.fromArray(o.instanceColor.array, i * 3); const c = new Float32Array(q.attributes.position.count * 3); for (let k = 0; k < c.length; k += 3) { c[k] = col.r; c[k + 1] = col.g; c[k + 2] = col.b; } q.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
            parts.push(q);
          }
          let g = merge(parts);
          if (o.instanceColor) { let off = 0; const c = new Float32Array(g.attributes.position.count * 3); for (const q of parts) { c.set(q.attributes.color.array, off); off += q.attributes.color.array.length; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
          add(g, mat);
        } else {
          add(o.geometry.clone().applyMatrix4(o.matrixWorld), mat);
        }
      });
    }
    // luci: lampade (dalle aure luminose), luci d'ambiente
    const luci = [];
    for (const q of flick) { const s = q.s; s.updateMatrixWorld(); const v = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld); luci.push({ tipo: q.c ? 'candela' : q.base > 0.95 ? 'globo' : q.base > 0.85 ? 'sospensione' : 'applique', p: [v.x, v.y, v.z] }); }
    for (const k of ['PT', 'S1']) for (const l of lights[k]) { const v = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld); luci.push({ tipo: 'ambiente', p: [v.x, v.y, v.z], col: l.color.getHex(), piano: k }); }
    const exp = new THREE.GLTFExporter();
    const glb = await new Promise(r => exp.parse(out, r, { binary: true, maxTextureSize: 2048 }));
    const bytes = new Uint8Array(glb); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return { glb: btoa(bin), luci, tour: campionaTour(fps), meshes: n };
  }, Number(fps));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(out + '/scena.glb', Buffer.from(res.glb, 'base64'));
  fs.writeFileSync(out + '/luci.json', JSON.stringify(res.luci));
  fs.writeFileSync(out + '/tour.json', JSON.stringify(res.tour));
  console.log('mesh', res.meshes, 'luci', res.luci.length, 'fotogrammi', res.tour.pos.length);
  await b.close();
})();
