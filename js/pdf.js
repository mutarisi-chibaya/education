// A small PDF writer: one JPEG image per A4 page. Enough for the survival plan,
// which is drawn on canvases, with no library and nothing downloaded.

const A4 = { w: 595.28, h: 841.89 }; // points

// pages: [{ jpeg: Uint8Array, width, height }] -> Blob (application/pdf)
export function imagesToPdf(pages) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const object = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

  // Objects: 1 catalog, 2 page tree, then three per page (page, content, image).
  const pageId = (i) => 3 + i * 3;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  pages.forEach((p, i) => {
    const n = pageId(i);
    const draw = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`;
    object(n, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`));
    object(n + 1, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    object(n + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const count = pageId(pages.length);
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

export const A4_RATIO = A4.h / A4.w;
