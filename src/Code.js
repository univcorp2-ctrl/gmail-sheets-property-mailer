const SHEET_NAMES = {
  CONFIG: 'Config',
  RECIPIENTS: 'Recipients',
  LISTINGS: 'Listings',
  LOG: 'SendLog'
};

const DEFAULTS = {
  SENDER_NAME: '物件配信',
  REPLY_TO: '',
  TEST_MODE: 'true',
  TEST_EMAIL: '',
  MAX_SEND_PER_RUN: '20',
  UNSUBSCRIBE_TEXT: '配信停止をご希望の場合は、このメールに返信してください。'
};

/**
 * Main function. Run manually first, then create a daily trigger.
 */
function sendDailyPropertyMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('別の送信処理が実行中です。時間をおいて再実行してください。');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = getConfig_(ss);
    const listingsResult = getUnsentListings_(ss);

    if (listingsResult.items.length === 0) {
      log_(ss, 'SKIP', '未送信の物件がありません。');
      return;
    }

    const recipients = getEligibleRecipients_(ss);
    if (recipients.length === 0) {
      log_(ss, 'SKIP', '送信対象の宛先がありません。');
      return;
    }

    const testMode = toBool_(config.TEST_MODE);
    const maxSendPerRun = Math.max(1, Number(config.MAX_SEND_PER_RUN || DEFAULTS.MAX_SEND_PER_RUN));
    const quota = MailApp.getRemainingDailyQuota();
    const sendLimit = Math.min(maxSendPerRun, quota);

    if (sendLimit <= 0) {
      throw new Error('本日のApps Scriptメール送信可能数が残っていません。');
    }

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const subject = `【物件情報】${today} 新着${listingsResult.items.length}件`;
    const htmlBody = buildHtmlBody_(listingsResult.items, config, today);
    const plainBody = buildPlainBody_(listingsResult.items, config, today);

    let sentCount = 0;

    if (testMode) {
      if (!config.TEST_EMAIL) {
        throw new Error('TEST_MODE=true の場合、Config.TEST_EMAIL を設定してください。');
      }

      MailApp.sendEmail({
        to: config.TEST_EMAIL,
        subject: `[TEST] ${subject}`,
        body: plainBody,
        htmlBody,
        name: config.SENDER_NAME,
        replyTo: config.REPLY_TO || ''
      });

      sentCount = 1;
      log_(ss, 'TEST_SENT', `${config.TEST_EMAIL} にテスト送信しました。`);
      return;
    }

    const targets = recipients.slice(0, sendLimit);
    for (const recipient of targets) {
      MailApp.sendEmail({
        to: recipient.email,
        subject,
        body: personalizeText_(plainBody, recipient),
        htmlBody: personalizeHtml_(htmlBody, recipient),
        name: config.SENDER_NAME,
        replyTo: config.REPLY_TO || ''
      });

      markRecipientSent_(ss, recipient.rowNumber);
      sentCount++;
      Utilities.sleep(500);
    }

    if (sentCount > 0) {
      markListingsSent_(ss, listingsResult.items);
    }

    log_(ss, 'SENT', `${sentCount}件送信しました。対象候補=${recipients.length}, 物件=${listingsResult.items.length}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a daily trigger at 8 AM JST.
 * Run once manually.
 */
function createDailyTrigger() {
  ScriptApp.newTrigger('sendDailyPropertyMail')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}

/**
 * Deletes all triggers for this project.
 */
function deleteAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function getConfig_(ss) {
  const sheet = requireSheet_(ss, SHEET_NAMES.CONFIG);
  const values = sheet.getDataRange().getValues();
  const config = Object.assign({}, DEFAULTS);

  values.forEach(row => {
    const key = String(row[0] || '').trim();
    const value = String(row[1] || '').trim();
    if (key) config[key] = value;
  });

  return config;
}

function getEligibleRecipients_(ss) {
  const sheet = requireSheet_(ss, SHEET_NAMES.RECIPIENTS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const idx = indexMap_(headers);
  requireColumns_(idx, ['email', 'status', 'consent']);

  const recipients = [];
  values.slice(1).forEach((row, i) => {
    const email = String(row[idx.email] || '').trim();
    const status = String(row[idx.status] || '').trim().toLowerCase();
    const consent = String(row[idx.consent] || '').trim().toLowerCase();

    if (!email) return;
    if (status !== 'active') return;
    if (consent !== 'yes') return;

    recipients.push({
      rowNumber: i + 2,
      email,
      company: idx.company !== undefined ? String(row[idx.company] || '').trim() : '',
      name: idx.name !== undefined ? String(row[idx.name] || '').trim() : ''
    });
  });

  return dedupeRecipients_(recipients);
}

function getUnsentListings_(ss) {
  const sheet = requireSheet_(ss, SHEET_NAMES.LISTINGS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { items: [], idx: {} };

  const headers = values[0].map(h => String(h).trim());
  const idx = indexMap_(headers);
  requireColumns_(idx, ['id', 'title', 'price', 'area', 'layout', 'station', 'url', 'comment', 'status', 'sent_at']);

  const items = [];
  values.slice(1).forEach((row, i) => {
    const title = String(row[idx.title] || '').trim();
    const status = String(row[idx.status] || '').trim().toLowerCase();
    if (!title || status) return;

    items.push({
      rowNumber: i + 2,
      id: String(row[idx.id] || '').trim(),
      title,
      price: String(row[idx.price] || '').trim(),
      area: String(row[idx.area] || '').trim(),
      layout: String(row[idx.layout] || '').trim(),
      station: String(row[idx.station] || '').trim(),
      url: String(row[idx.url] || '').trim(),
      comment: String(row[idx.comment] || '').trim()
    });
  });

  return { items, idx };
}

function buildHtmlBody_(items, config, today) {
  const cards = items.map(item => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin:0 0 14px;">
      <h3 style="margin:0 0 8px;font-size:18px;">${esc_(item.title)}</h3>
      <p style="margin:4px 0;"><b>価格:</b> ${esc_(item.price)}</p>
      <p style="margin:4px 0;"><b>エリア:</b> ${esc_(item.area)}</p>
      <p style="margin:4px 0;"><b>間取り:</b> ${esc_(item.layout)}</p>
      <p style="margin:4px 0;"><b>最寄り:</b> ${esc_(item.station)}</p>
      <p style="margin:4px 0;"><b>コメント:</b> ${esc_(item.comment)}</p>
      ${item.url ? `<p style="margin:8px 0 0;"><a href="${escAttr_(item.url)}">詳細を見る</a></p>` : ''}
    </div>
  `).join('');

  return `
    <div style="font-family:Arial,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;line-height:1.7;color:#222;">
      <p>{{company}} {{name}} 様</p>
      <p>お世話になっております。${esc_(today)} の物件情報をお送りします。</p>
      ${cards}
      <hr>
      <p style="font-size:12px;color:#666;">${esc_(config.UNSUBSCRIBE_TEXT)}</p>
      <p style="font-size:12px;color:#666;">送信者: ${esc_(config.SENDER_NAME)}</p>
    </div>
  `;
}

function buildPlainBody_(items, config, today) {
  const lines = [
    '{{company}} {{name}} 様',
    '',
    `お世話になっております。${today} の物件情報をお送りします。`,
    ''
  ];

  items.forEach((item, i) => {
    lines.push(`【${i + 1}】${item.title}`);
    lines.push(`価格: ${item.price}`);
    lines.push(`エリア: ${item.area}`);
    lines.push(`間取り: ${item.layout}`);
    lines.push(`最寄り: ${item.station}`);
    lines.push(`コメント: ${item.comment}`);
    if (item.url) lines.push(`詳細: ${item.url}`);
    lines.push('');
  });

  lines.push('---');
  lines.push(config.UNSUBSCRIBE_TEXT);
  lines.push(`送信者: ${config.SENDER_NAME}`);

  return lines.join('\n');
}

function personalizeHtml_(html, recipient) {
  return html
    .replaceAll('{{company}}', esc_(recipient.company || ''))
    .replaceAll('{{name}}', esc_(recipient.name || ''));
}

function personalizeText_(text, recipient) {
  return text
    .replaceAll('{{company}}', recipient.company || '')
    .replaceAll('{{name}}', recipient.name || '');
}

function markRecipientSent_(ss, rowNumber) {
  const sheet = requireSheet_(ss, SHEET_NAMES.RECIPIENTS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const idx = indexMap_(headers);

  if (idx.last_sent_at !== undefined) {
    sheet.getRange(rowNumber, idx.last_sent_at + 1).setValue(new Date());
  }
}

function markListingsSent_(ss, items) {
  const sheet = requireSheet_(ss, SHEET_NAMES.LISTINGS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const idx = indexMap_(headers);
  requireColumns_(idx, ['status', 'sent_at']);

  const now = new Date();
  items.forEach(item => {
    sheet.getRange(item.rowNumber, idx.status + 1).setValue('sent');
    sheet.getRange(item.rowNumber, idx.sent_at + 1).setValue(now);
  });
}

function log_(ss, status, message) {
  let sheet = ss.getSheetByName(SHEET_NAMES.LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.LOG);
    sheet.appendRow(['timestamp', 'status', 'message']);
  }

  sheet.appendRow([new Date(), status, message]);
}

function requireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`シート「${name}」が見つかりません。`);
  return sheet;
}

function requireColumns_(idx, columns) {
  columns.forEach(column => {
    if (idx[column] === undefined) {
      throw new Error(`必須列「${column}」が見つかりません。`);
    }
  });
}

function indexMap_(headers) {
  const map = {};
  headers.forEach((header, i) => {
    map[String(header).trim()] = i;
  });
  return map;
}

function dedupeRecipients_(recipients) {
  const seen = new Set();
  const result = [];

  recipients.forEach(recipient => {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(recipient);
  });

  return result;
}

function toBool_(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function esc_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr_(value) {
  return esc_(value).replace(/"/g, '&quot;');
}
