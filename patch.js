const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startStr = "app.post('/upload/:programId/:itemId', upload.single('file'), async (req, res) => {";
const endStr = "// Notify linked groups endpoint";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const newCode = code.substring(0, startIndex) + `
// Upload file directly to Telegram and return file_id
app.post('/upload/telegram', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  const customName = req.body.customName || req.file.originalname;
  const userId = req.body.userId;
  const fileType = req.file.mimetype;
  
  if (!userId) return res.status(400).json({ error: "No userId provided" });

  try {
    const msg = await bot.telegram.sendDocument(userId, {
      source: req.file.buffer,
      filename: customName
    }, {
      caption: \`📁 <b>Файл завантажено в систему!</b>\\n\\nНазва: \${customName}\\n<i>Він тепер прикріплений до вашої програми. Ви можете видалити це повідомлення.</i>\`,
      parse_mode: 'HTML'
    });

    const file_id = msg.document.file_id;
    
    res.json({ 
      ok: true, 
      file_id, 
      name: customName, 
      type: fileType,
      url: \`/download/telegram/\${file_id}?name=\${encodeURIComponent(customName)}\`
    });
  } catch (err) {
    console.error("Telegram Upload error:", err);
    res.status(500).json({ error: err.message || "Failed to upload to Telegram" });
  }
});

// Download file via Telegram file_id
const https = require('https');
app.get('/download/telegram/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const originalName = req.query.name || 'file';
    
    const link = await bot.telegram.getFileLink(fileId);
    
    res.setHeader('Content-Disposition', \`attachment; filename="\${encodeURIComponent(originalName)}"\`);
    
    https.get(link.href, (stream) => {
      stream.pipe(res);
    }).on('error', (err) => {
      console.error("Stream error:", err);
      res.status(500).send('Error downloading file');
    });
  } catch (err) {
    console.error("Download proxy error:", err);
    res.status(500).send('Error downloading file');
  }
});

` + code.substring(endIndex);
  fs.writeFileSync('server.js', newCode);
  console.log("Patched server.js successfully.");
} else {
  console.log("Could not find start or end strings.", startIndex, endIndex);
}
