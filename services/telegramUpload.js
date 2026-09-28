const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TRANSIENT_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'];

function isTransientError(err) {
  if (!err) return false;
  if (TRANSIENT_ERRORS.includes(err.code)) return true;
  if (err.message && err.message.includes('socket hang up')) return true;
  if (err.message && err.message.includes('timeout')) return true;
  if (err.type === 'system' && TRANSIENT_ERRORS.includes(err.errno)) return true;
  
  if (err.response && err.response.error_code === 429) return true;
  if (err.code === 429) return true;
  
  if (err.response && err.response.error_code >= 500) return true;
  if (err.code >= 500) return true;

  return false;
}

function getUserFriendlyError(err) {
  if (err.response && err.response.error_code === 413) {
    return 'Файл завеликий для завантаження через Telegram.';
  }
  if (err.response && err.response.error_code === 400) {
    return 'Некоректний файл або параметри запиту.';
  }
  if (err.response && err.response.error_code === 401) {
    return 'Помилка авторизації бота Telegram.';
  }
  if (err.response && err.response.error_code === 403) {
    return 'Бот заблокований. Спочатку натисніть Start у боті @ProgramLive_bot.';
  }
  
  if (isTransientError(err)) {
    return 'Не вдалося завантажити файл у Telegram. Спробуйте ще раз через кілька секунд.';
  }
  
  return 'Невідома помилка під час завантаження в Telegram.';
}

async function sendDocumentWithRetry(bot, chatId, fileBuffer, filename, mimeType, caption) {
  const maxRetries = 3;
  const delays = [1000, 2500, 5000];

  const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Upload] Attempt ${attempt}/${maxRetries}`);
    console.log(`[Upload] filename: ${filename}`);
    console.log(`[Upload] size: ${fileSizeMB} MB`);
    console.log(`[Upload] mime: ${mimeType}`);

    try {
      
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      
      const blob = new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' });
      formData.append('document', blob, filename);

      const url = `https://api.telegram.org/bot${bot.telegram.token}/sendDocument`;
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000)
      });
      
      if (!response.ok) {
         let errBody = {};
         try { errBody = await response.json(); } catch(e) {}
         const err = new Error(errBody.description || 'Telegram API Error');
         err.response = { error_code: errBody.error_code };
         throw err;
      }
      
      const data = await response.json();
      const msg = data.result;
      
      console.log(`[Upload] Success on attempt ${attempt}`);
      return msg;
    } catch (err) {
      const code = err.code || (err.response && err.response.error_code) || 'UNKNOWN_CODE';
      const msgStr = err.message || 'No message';
      console.error(`[Upload] Failed:`);
      console.error(`[Upload] code: ${code}`);
      console.error(`[Upload] message: ${msgStr}`);

      if (attempt < maxRetries && isTransientError(err)) {
        console.log(`[Upload] retrying in ${delays[attempt - 1]}ms...`);
        await wait(delays[attempt - 1]);
        continue;
      }
      
      const userMessage = getUserFriendlyError(err);
      const controlledError = new Error(userMessage);
      controlledError.isUserFriendly = true;
      controlledError.originalError = err;
      // We pass through the HTTP status code context
      controlledError.statusCode = isTransientError(err) ? 502 : 400; 
      if (err.response && err.response.error_code === 413) controlledError.statusCode = 413;
      if (err.response && err.response.error_code === 403) controlledError.statusCode = 403;

      throw controlledError;
    }
  }
}

module.exports = {
  sendDocumentWithRetry
};
