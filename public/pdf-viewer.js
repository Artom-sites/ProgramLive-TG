// pdf-viewer.js
let pdfDoc = null;
let currentZoom = 1.0;
let pdfUrl = null;
let pdfTitle = null;
let renderTask = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';

function openPdfViewer(url, title) {
  pdfUrl = url;
  pdfTitle = title;
  currentZoom = 1.0; // Reset zoom on open
  
  document.getElementById('pdf-viewer').style.display = 'flex';
  document.getElementById('pdf-title').textContent = title;
  document.getElementById('pdf-pages').innerHTML = '';
  document.getElementById('pdf-loading').style.display = 'block';
  document.getElementById('pdf-error').style.display = 'none';

  // Toggle Telegram MainButton/BackButton
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.BackButton.show();
    window.Telegram.WebApp.BackButton.onClick(closePdfViewer);
  }

  loadPdf(url);
}

function closePdfViewer() {
  document.getElementById('pdf-viewer').style.display = 'none';
  document.getElementById('pdf-pages').innerHTML = ''; // free memory
  pdfDoc = null;
  pdfUrl = null;
  
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.BackButton.offClick(closePdfViewer);
    window.Telegram.WebApp.BackButton.hide();
  }
}

async function loadPdf(url) {
  document.getElementById('pdf-loading').style.display = 'block';
  document.getElementById('pdf-error').style.display = 'none';
  document.getElementById('pdf-pages').innerHTML = '';

  try {
    const loadingTask = pdfjsLib.getDocument({
      url: url,
      // Pass auth headers if needed, but here it's public proxy
    });
    
    pdfDoc = await loadingTask.promise;
    document.getElementById('pdf-loading').style.display = 'none';
    
    await renderAllPages();
  } catch (err) {
    console.error("PDF Load Error:", err);
    document.getElementById('pdf-loading').style.display = 'none';
    document.getElementById('pdf-error').style.display = 'block';
    
    document.getElementById('pdf-external-btn').onclick = () => {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.openLink(window.location.origin + url);
      } else {
        window.open(url, '_blank');
      }
    };
  }
}

async function renderAllPages() {
  const container = document.getElementById('pdf-pages');
  container.innerHTML = '';
  
  // Minimal sequential render to avoid blocking
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    
    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    
    // Default zoom to fit viewport width roughly, or base 1.5
    const viewport = page.getViewport({ scale: currentZoom * 1.5 });
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
  }
}

async function updateZoom(delta) {
  if (!pdfDoc) return;
  const newZoom = currentZoom + delta;
  if (newZoom < 0.5 || newZoom > 3.0) return;
  
  currentZoom = newZoom;
  await renderAllPages();
}

// Bind events
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pdf-close-btn').addEventListener('click', closePdfViewer);
  document.getElementById('pdf-retry-btn').addEventListener('click', () => loadPdf(pdfUrl));
  document.getElementById('pdf-zoom-in').addEventListener('click', () => updateZoom(0.2));
  document.getElementById('pdf-zoom-out').addEventListener('click', () => updateZoom(-0.2));
});
