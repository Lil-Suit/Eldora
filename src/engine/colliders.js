// Mundo de colisão 2D (plano XZ): círculos e caixas orientadas numa grade espacial.
export class CollisionWorld {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.stamp = 0;
  }

  _key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }

  _insert(c) {
    const s = this.cell;
    c.cells = [];
    for (let ix = Math.floor(c.minX / s); ix <= Math.floor(c.maxX / s); ix++) {
      for (let iz = Math.floor(c.minZ / s); iz <= Math.floor(c.maxZ / s); iz++) {
        const k = this._key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(c); c.cells.push(k);
      }
    }
    c._s = 0;
    return c;
  }

  addCircle(x, z, r, o = {}) {
    return this._insert({ t: 'c', x, z, r, los: o.los ?? true, cam: o.cam ?? false, tag: o.tag || null, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  }

  // Caixa com centro, meia-largura (x local), meia-profundidade (z local) e rotação em Y
  // (rot no mesmo padrão de object.rotation.y do three.js)
  addBox(x, z, hw, hd, rot = 0, o = {}) {
    const cs = Math.cos(rot), sn = -Math.sin(rot);
    const ex = Math.abs(cs) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(cs) * hd;
    return this._insert({ t: 'b', x, z, hw, hd, cs, sn, los: o.los ?? true, cam: o.cam ?? true, tag: o.tag || null, minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez });
  }

  remove(c) {
    if (!c || !c.cells) return;
    for (const k of c.cells) {
      const arr = this.grid.get(k);
      if (arr) { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); }
    }
    c.cells = null;
  }

  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const s = this.cell, st = ++this.stamp;
    for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++) {
      for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++) {
        const arr = this.grid.get(this._key(ix, iz));
        if (!arr) continue;
        for (const c of arr) if (c._s !== st) { c._s = st; out.push(c); }
      }
    }
    return out;
  }

  // Empurra p {x,z} para fora dos colisores. Retorna true se houve contato.
  resolve(p, r) {
    const cand = this.query(p.x - r, p.z - r, p.x + r, p.z + r, this._tmp || (this._tmp = []));
    let hit = false;
    for (let it = 0; it < 2; it++) {
      for (const c of cand) {
        if (c.t === 'c') {
          const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.0001;
            const push = rr - d;
            p.x += (dx / d) * push; p.z += (dz / d) * push; hit = true;
          }
        } else {
          // espaço local da caixa
          const dx = p.x - c.x, dz = p.z - c.z;
          const lx = dx * c.cs + dz * c.sn, lz = -dx * c.sn + dz * c.cs;
          const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
          let nx = lx - qx, nz = lz - qz;
          let d2 = nx * nx + nz * nz;
          if (d2 > r * r) continue;
          hit = true;
          let ox, oz;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = r - d;
            ox = (nx / d) * push; oz = (nz / d) * push;
          } else {
            // centro dentro da caixa: sai pela face mais próxima
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { ox = Math.sign(lx || 1) * (px + r); oz = 0; } else { ox = 0; oz = Math.sign(lz || 1) * (pz + r); }
          }
          p.x += ox * c.cs - oz * c.sn; p.z += ox * c.sn + oz * c.cs;
        }
      }
    }
    return hit;
  }

  pointBlocked(x, z, pad = 0) {
    const cand = this.query(x - pad, z - pad, x + pad, z + pad, this._tmp2 || (this._tmp2 = []));
    for (const c of cand) {
      if (c.t === 'c') { if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return c; }
      else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cs + dz * c.sn, lz = -dx * c.sn + dz * c.cs;
        if (Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad) return c;
      }
    }
    return null;
  }

  // Primeiro impacto do segmento (fração 0..1) ou -1. filter: 'los' | 'cam' | null
  segment(ax, az, bx, bz, filter = 'los') {
    const cand = this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this._tmp3 || (this._tmp3 = []));
    const dx = bx - ax, dz = bz - az;
    let best = Infinity;
    for (const c of cand) {
      if (filter && !c[filter]) continue;
      let t;
      if (c.t === 'c') {
        const fx = ax - c.x, fz = az - c.z;
        const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), Cc = fx * fx + fz * fz - c.r * c.r;
        if (Cc < 0) { t = 0; } else {
          const disc = B * B - 4 * A * Cc;
          if (disc < 0 || A === 0) continue;
          t = (-B - Math.sqrt(disc)) / (2 * A);
          if (t < 0 || t > 1) continue;
        }
      } else {
        const ox = ax - c.x, oz = az - c.z;
        const lax = ox * c.cs + oz * c.sn, laz = -ox * c.sn + oz * c.cs;
        const ldx = dx * c.cs + dz * c.sn, ldz = -dx * c.sn + dz * c.cs;
        let t0 = 0, t1 = 1;
        const slab = (o, d, h) => {
          if (Math.abs(d) < 1e-9) return Math.abs(o) <= h;
          let ta = (-h - o) / d, tb = (h - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          return t0 <= t1;
        };
        if (!slab(lax, ldx, c.hw) || !slab(laz, ldz, c.hd)) continue;
        t = t0;
      }
      if (t < best) best = t;
    }
    return best === Infinity ? -1 : best;
  }
}
