// Limpieza de la imagen de una firma (foto o escaneo): quita el fondo y las
// sombras, deja solo el trazo en tinta azul uniforme y recorta los bordes.
//   1. Fondo local: el punto más claro de cada bloque, suavizado. Una sombra
//      es un cambio de luz gradual, así que queda en el fondo y no en la tinta.
//   2. Tinta = cuánto más oscuro que su fondo local es cada punto.
//   3. Manchas rellenas (sombras de borde, dedos): una apertura morfológica
//      elimina el trazo delgado y deja solo lo grueso, que se borra.
//   4. Puntitos sueltos (ruido de la foto): se descartan los grupos pequeños
//      o débiles.
//   5. El trazo se engruesa levemente para que no se pierda al achicarlo en
//      el formulario.

const TINTA = [15, 42, 92];
const BLOQUE = 24;

// Mínimo / máximo en una ventana cuadrada (separable: filas y luego columnas)
function filtro(mask, w, h, radio, esMax) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pasar = (src, dst, largo, paso, cantidad, salto) => {
    for (let k = 0; k < cantidad; k++) {
      const base = k * salto;
      for (let i = 0; i < largo; i++) {
        let v = esMax ? 0 : 1;
        const a = Math.max(0, i - radio);
        const b = Math.min(largo - 1, i + radio);
        for (let j = a; j <= b; j++) {
          const x = src[base + j * paso];
          if (esMax ? x : !x) { v = esMax ? 1 : 0; break; }
        }
        dst[base + i * paso] = v;
      }
    }
  };
  pasar(mask, tmp, w, 1, h, w);   // filas
  pasar(tmp, out, h, w, w, 1);    // columnas
  return out;
}

// data: RGBA (Uint8ClampedArray) sobre fondo blanco; devuelve RGBA limpio
export function limpiarPixeles(data, w, h) {
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    // Píxeles transparentes cuentan como fondo blanco
    L[i] = 255 - a * (255 - (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11));
  }

  // 1. Fondo local
  const gw = Math.ceil(w / BLOQUE);
  const gh = Math.ceil(h / BLOQUE);
  const blk = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = Math.floor(y / BLOQUE) * gw + Math.floor(x / BLOQUE);
      if (L[y * w + x] > blk[k]) blk[k] = L[y * w + x];
    }
  }
  const suave = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { s += blk[yy * gw + xx]; n++; }
        }
      }
      suave[y * gw + x] = s / n;
    }
  }
  const fondo = (x, y) => {
    const fx = Math.min(Math.max(x / BLOQUE - 0.5, 0), gw - 1);
    const fy = Math.min(Math.max(y / BLOQUE - 0.5, 0), gh - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, gw - 1), y1 = Math.min(y0 + 1, gh - 1);
    const tx = fx - x0, ty = fy - y0;
    const arriba = suave[y0 * gw + x0] * (1 - tx) + suave[y0 * gw + x1] * tx;
    const abajo = suave[y1 * gw + x0] * (1 - tx) + suave[y1 * gw + x1] * tx;
    return arriba * (1 - ty) + abajo * ty;
  };

  // 2. Tinta
  const alpha = new Uint8ClampedArray(w * h);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = (fondo(x, y) - L[i] - 30) * 8;
      if (v > 0) { alpha[i] = v; mask[i] = 1; }
    }
  }

  // 3. Manchas rellenas: apertura (radio 5) y un margen de 3
  const gruesa = filtro(filtro(filtro(mask, w, h, 5, false), w, h, 5, true), w, h, 3, true);
  for (let i = 0; i < w * h; i++) if (gruesa[i]) { alpha[i] = 0; mask[i] = 0; }

  // 4. Grupos pequeños o débiles
  const visto = new Uint8Array(w * h);
  const pila = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || visto[s]) continue;
    let tope = 0, cant = 0, max = 0;
    const grupo = [];
    pila[tope++] = s; visto[s] = 1;
    while (tope) {
      const i = pila[--tope];
      grupo.push(i); cant++;
      if (alpha[i] > max) max = alpha[i];
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mask[j] && !visto[j]) { visto[j] = 1; pila[tope++] = j; }
        }
      }
    }
    if (cant < 40 || max < 200) for (const i of grupo) alpha[i] = 0;
  }

  // 5. Engrosar: cada punto toma al menos el 70 % del vecino más oscuro
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let vecino = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && alpha[yy * w + xx] > vecino) vecino = alpha[yy * w + xx];
        }
      }
      out[i * 4] = TINTA[0]; out[i * 4 + 1] = TINTA[1]; out[i * 4 + 2] = TINTA[2];
      out[i * 4 + 3] = Math.max(alpha[i], vecino * 0.7);
    }
  }
  return out;
}

// Recorta los bordes transparentes de un canvas; null si no queda trazo
export function recortarCanvas(canvas, margen = 6) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < x1) x1 = x; if (x > x2) x2 = x;
        if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  x1 = Math.max(x1 - margen, 0); y1 = Math.max(y1 - margen, 0);
  x2 = Math.min(x2 + margen, width - 1); y2 = Math.min(y2 + margen, height - 1);
  const out = document.createElement('canvas');
  out.width = x2 - x1 + 1;
  out.height = y2 - y1 + 1;
  out.getContext('2d').drawImage(canvas, x1, y1, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

const cache = new Map();

// Firma guardada (data URL PNG) → versión limpia y recortada. Si algo falla
// se devuelve la original.
export function limpiarFirma(dataUrl) {
  if (!dataUrl) return Promise.resolve(dataUrl);
  if (cache.has(dataUrl)) return cache.get(dataUrl);
  const p = new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const datos = ctx.getImageData(0, 0, c.width, c.height);
        datos.data.set(limpiarPixeles(datos.data, c.width, c.height));
        ctx.putImageData(datos, 0, 0);
        const r = recortarCanvas(c);
        ok(r ? r.toDataURL('image/png') : dataUrl);
      } catch {
        ok(dataUrl);
      }
    };
    img.onerror = () => ok(dataUrl);
    img.src = dataUrl;
  });
  cache.set(dataUrl, p);
  return p;
}
