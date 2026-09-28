// pdf-viewer.js
let pdfDoc = null;
let currentZoom = 1.0;
let pdfUrl = null;
let pdfTitle = null;

let pdfPerfStart = 0;
let renderedPages = new Set();
let pageRenderTasks = new Map();
let observer = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';

// Memory cache for ArrayBuffers to avoid re-fetching on the same session
const pdfBufferCache = new Map();

async function openPdfViewer(url, title) {
  pdfPerfStart = performance.now();
  console.log(`[PDF Perf] viewer opened: 0ms`);
  
  pdfUrl = url;
  pdfTitle = title;
  currentZoom = 1.0; 
  renderedPages.clear();
  pageRenderTasks.clear();
  
  document.getElementById('pdf-viewer').style.display = 'flex';
  document.getElementById('pdf-title').textContent = title;
  
  const container = document.getElementById('pdf-pages');
  container.innerHTML = ''; 
  
  document.getElementById('pdf-loading').style.display = 'block';
  document.getElementById('pdf-error').style.display = 'none';

  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.BackButton.show();
    window.Telegram.WebApp.BackButton.onClick(closePdfViewer);
  }

  await loadPdf(url);
}

function closePdfViewer() {
  document.getElementById('pdf-viewer').style.display = 'none';
  document.getElementById('pdf-pages').innerHTML = ''; // free memory
  
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  pdfDoc = null;
  pdfUrl = null;
  renderedPages.clear();
  pageRenderTasks.clear();
  
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.BackButton.offClick(closePdfViewer);
    window.Telegram.WebApp.BackButton.hide();
  }
}

async function fetchPdfAsBuffer(url) {
  if (pdfBufferCache.has(url)) {
    console.log(`[PDF Perf] using cached ArrayBuffer for ${url}`);
    return pdfBufferCache.get(url);
  }
  const response = await fetch(url);
  console.log(`[PDF Perf] first bytes received: ${Math.round(performance.now() - pdfPerfStart)}ms`);
  
  const buffer = await response.arrayBuffer();
  
  // Cache management (keep max 3 files)
  if (pdfBufferCache.size >= 3) {
    const firstKey = pdfBufferCache.keys().next().value;
    pdfBufferCache.delete(firstKey);
  }
  pdfBufferCache.set(url, buffer);
  
  return buffer;
}

async function loadPdf(url) {
  try {
    const buffer = await fetchPdfAsBuffer(url);
    
    const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
    pdfDoc = await loadingTask.promise;
    console.log(`[PDF Perf] PDF document ready: ${Math.round(performance.now() - pdfPerfStart)}ms`);
    
    document.getElementById('pdf-loading').style.display = 'none';
    
    setupPagePlaceholders();
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

function setupPagePlaceholders() {
  const container = document.getElementById('pdf-pages');
  container.innerHTML = '';
  renderedPages.clear();
  
  if (observer) observer.disconnect();
  
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!renderedPages.has(pageNum)) {
          renderPage(pageNum, entry.target);
        }
      }
    });
  }, {
    root: document.getElementById('pdf-container'),
    rootMargin: '800px 0px' // Load 1-2 pages ahead
  });

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.page = pageNum;
    // Set a sensible default minimum height for placeholder to trigger scroll bounds correctly
    wrapper.style.minHeight = '600px'; 
    wrapper.style.width = '100%';
    
    container.appendChild(wrapper);
    observer.observe(wrapper);
    
    // Render first page immediately regardless of observer delay
    if (pageNum === 1) {
      renderPage(1, wrapper);
    }
  }
}

async function renderPage(pageNum, wrapper) {
  if (renderedPages.has(pageNum)) return;
  
  // Prevent duplicate concurrent renders
  if (pageRenderTasks.has(pageNum)) return pageRenderTasks.get(pageNum);
  
  const renderPromise = (async () => {
    try {
      const page = await pdfDoc.getPage(pageNum);
      if (pageNum === 1) console.log(`[PDF Perf] page 1 ready: ${Math.round(performance.now() - pdfPerfStart)}ms`);
      
      let canvas = wrapper.querySelector('canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        wrapper.innerHTML = ''; // clear loading skeleton if any
        wrapper.appendChild(canvas);
      }
      
      const containerWidth = document.getElementById('pdf-container').clientWidth - 32; // minus padding
      
      // Calculate fit-to-width scale
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = containerWidth / unscaledViewport.width;
      
      const viewport = page.getViewport({ scale: baseScale * currentZoom });
      const context = canvas.getContext('2d', { alpha: false });
      
      // Handle high-DPI displays (retina), capped at 2 for performance
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      
      // Allow wrapper to fit actual height
      wrapper.style.minHeight = `${viewport.height}px`;
      
      context.scale(dpr, dpr);
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      
      renderedPages.add(pageNum);
      if (pageNum === 1) console.log(`[PDF Perf] page 1 rendered: ${Math.round(performance.now() - pdfPerfStart)}ms`);
      
    } catch (e) {
      console.error(`Error rendering page ${pageNum}:`, e);
    } finally {
      pageRenderTasks.delete(pageNum);
    }
  })();
  
  pageRenderTasks.set(pageNum, renderPromise);
  return renderPromise;
}

async function updateZoom(delta) {
  if (!pdfDoc) return;
  const newZoom = currentZoom + delta;
  if (newZoom < 0.5 || newZoom > 3.0) return;
  
  currentZoom = newZoom;
  
  // Re-run setup to clear and re-trigger visible placeholders with new scale
  setupPagePlaceholders();
}

// Bind events
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pdf-close-btn').addEventListener('click', closePdfViewer);
  document.getElementById('pdf-retry-btn').addEventListener('click', () => loadPdf(pdfUrl));
  document.getElementById('pdf-zoom-in').addEventListener('click', () => updateZoom(0.2));
  document.getElementById('pdf-zoom-out').addEventListener('click', () => updateZoom(-0.2));
});

window.openPdfViewer = openPdfViewer;

window.prefetchPdf = async function(url) {
  if (!url || pdfBufferCache.has(url)) return;
  
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => fetchPdfAsBuffer(url).catch(e=>console.warn('Prefetch failed', e)));
  } else {
    setTimeout(() => fetchPdfAsBuffer(url).catch(e=>console.warn('Prefetch failed', e)), 1000);
  }
};
