/* ============================================================
   ColorToLife - Sheet UI helpers
   ------------------------------------------------------------
   - Injects the printable sheet preview into the instructions page
   - SVG download (Blob) and A4 printing via a hidden iframe
   - Recolored digital previews for gallery / review screens
   ============================================================ */
var CTL_SheetUI = (function () {

  function svgToBlobUrl(svgString) {
    var blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(blob);
  }

  /* ---------- instructions screen ---------- */

  function renderSheetPreview(container) {
    container.innerHTML = CTL_Templates.sheetSVG();
    var svg = container.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }

  function downloadSheet() {
    var svg = CTL_Templates.sheetSVG();
    var url = svgToBlobUrl(svg);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'colortolife-dino-coloring-sheet.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* Print the sheet on a single A4 page via a hidden iframe. */
  function printSheet() {
    var svg = CTL_Templates.sheetSVG();
    var frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('title', 'ColorToLife print');
    document.body.appendChild(frame);

    var doc = frame.contentWindow.document;
    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><title>ColorToLife - Dino Coloring Sheet</title>' +
      '<style>' +
      '@page { size: A4 portrait; margin: 0; }' +
      'html, body { margin: 0; padding: 0; background: #fff; }' +
      'svg { width: 100vw; height: 100vh; display: block; }' +
      '</style></head><body>' + svg + '</body></html>'
    );
    doc.close();
    setTimeout(function () {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function () { document.body.removeChild(frame); }, 1500);
    }, 350);
  }

  /* ---------- recolored previews ---------- */

  function renderColoredPreview(container, colors, opts) {
    container.innerHTML = CTL_Templates.previewSVG(colors, opts || {});
    var svg = container.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }

  return {
    renderSheetPreview: renderSheetPreview,
    downloadSheet: downloadSheet,
    printSheet: printSheet,
    renderColoredPreview: renderColoredPreview
  };
})();
