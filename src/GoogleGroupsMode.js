const GROUP_DEFAULTS = {
  GROUP_EMAIL: '',
  GROUP_TEST_EMAIL: '',
  GROUP_SEND_DAYS: 'MON,WED,FRI',
  GROUP_TRIGGER_HOUR: '8',
  GROUP_DRY_RUN: 'true',
  GROUP_EXPORT_LIMIT: '100'
};

/**
 * Send one property digest email to a Google Groups address.
 * In TEST_MODE=true, sends to GROUP_TEST_EMAIL or TEST_EMAIL instead.
 */
function sendToGoogleGroup() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('別の送信処理が実行中です。');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = getGroupConfig_(ss);

    if (!isGroupSendDay_(config)) {
      log_(ss, 'GROUP_SKIP', `送信曜日ではありません: ${config.GROUP_SEND_DAYS}`);
      return;
    }

    const listings = getUnsentListings_(ss).items;
    if (listings.length === 0) {
      log_(ss, 'GROUP_SKIP', '未送信の物件がありません。');
      return;
    }

    const testMode = toBool_(config.TEST_MODE);
    const dryRun = toBool_(config.GROUP_DRY_RUN);
    const to = testMode ? (config.GROUP_TEST_EMAIL || config.TEST_EMAIL) : config.GROUP_EMAIL;
    if (!to) throw new Error('GROUP_EMAIL または GROUP_TEST_EMAIL/TEST_EMAIL を設定してください。');

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const subject = `${testMode ? '[TEST] ' : ''}【物件情報】${today} 新着${listings.length}件`;
    const htmlBody = buildGroupHtml_(listings, config, today);
    const body = buildGroupText_(listings, config, today);

    if (dryRun) {
      log_(ss, 'GROUP_DRY_RUN', `送信予定: to=${to}, subject=${subject}, listings=${listings.length}`);
      return;
    }

    MailApp.sendEmail({
      to,
      subject,
      body,
      htmlBody,
      name: config.SENDER_NAME || '物件配信',
      replyTo: config.REPLY_TO || ''
    });

    if (!testMode) markListingsSent_(ss, listings);
    log_(ss, testMode ? 'GROUP_TEST_SENT' : 'GROUP_SENT', `to=${to}, listings=${listings.length}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Export active + consent=yes recipients to GroupImport sheet.
 * Use the result for manual Google Groups member addition.
 */
function exportEligibleRecipientsForGoogleGroup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getGroupConfig_(ss);
  const limit = Math.max(1, Number(config.GROUP_EXPORT_LIMIT || GROUP_DEFAULTS.GROUP_EXPORT_LIMIT));
  const recipients = getEligibleRecipients_(ss).slice(0, limit);

  writeRows_(ss, 'GroupImport', ['email', 'company', 'name'], recipients.map(r => [r.email, r.company || '', r.name || '']));
  log_(ss, 'GROUP_IMPORT_EXPORT', `${recipients.length}件をGroupImportへ出力しました。`);
}

/**
 * Export status=stopped/bounced recipients to GroupRemoval sheet.
 * Remove these members manually from Google Groups.
 */
function exportStoppedRecipientsForGoogleGroupRemoval() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = requireSheet_(ss, 'Recipients');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map(h => String(h).trim());
  const idx = indexMap_(headers);
  requireColumns_(idx, ['email', 'status']);

  const rows = values.slice(1)
    .filter(row => ['stopped', 'bounced', 'blocked'].includes(String(row[idx.status] || '').trim().toLowerCase()))
    .map(row => [row[idx.email], row[idx.status], idx.company !== undefined ? row[idx.company] : '', idx.name !== undefined ? row[idx.name] : '']);

  writeRows_(ss, 'GroupRemoval', ['email', 'status', 'company', 'name'], rows);
  log_(ss, 'GROUP_REMOVAL_EXPORT', `${rows.length}件をGroupRemovalへ出力しました。`);
}

/**
 * Create weekly triggers for Google Groups mailing.
 */
function createWeeklyGoogleGroupTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getGroupConfig_(ss);
  const hour = Math.max(0, Math.min(23, Number(config.GROUP_TRIGGER_HOUR || GROUP_DEFAULTS.GROUP_TRIGGER_HOUR)));
  const days = parseGroupDays_(config.GROUP_SEND_DAYS || GROUP_DEFAULTS.GROUP_SEND_DAYS);

  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'sendToGoogleGroup') ScriptApp.deleteTrigger(t);
  });

  days.forEach(day => {
    ScriptApp.newTrigger('sendToGoogleGroup').timeBased().onWeekDay(day).atHour(hour).create();
  });

  log_(ss, 'GROUP_TRIGGERS_CREATED', `${config.GROUP_SEND_DAYS} ${hour}:00`);
}

function getGroupConfig_(ss) {
  const base = getConfig_(ss);
  return Object.assign({}, GROUP_DEFAULTS, base);
}

function buildGroupHtml_(items, config, today) {
  const cards = items.map(item => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin:0 0 14px;background:#fff;">
      <h3 style="margin:0 0 8px;font-size:18px;">${esc_(item.title)}</h3>
      <p style="margin:4px 0;"><b>価格:</b> ${esc_(item.price)}</p>
      <p style="margin:4px 0;"><b>エリア:</b> ${esc_(item.area)}</p>
      <p style="margin:4px 0;"><b>間取り:</b> ${esc_(item.layout)}</p>
      <p style="margin:4px 0;"><b>最寄り:</b> ${esc_(item.station)}</p>
      <p style="margin:4px 0;"><b>コメント:</b> ${esc_(item.comment)}</p>
      ${item.url ? `<p><a href="${escAttr_(item.url)}">詳細を見る</a></p>` : ''}
    </div>`).join('');

  return `<div style="font-family:Arial,'Yu Gothic',Meiryo,sans-serif;line-height:1.7;color:#222;max-width:680px;margin:auto;">
    <h2>${esc_(today)} の物件情報</h2>
    <p>新着物件 ${items.length} 件をお送りします。</p>
    ${cards}
    <hr>
    <p style="font-size:12px;color:#666;">${esc_(config.UNSUBSCRIBE_TEXT || '配信停止をご希望の場合は返信でご連絡ください。')}</p>
    <p style="font-size:12px;color:#666;">送信者: ${esc_(config.SENDER_NAME || '物件配信')}</p>
  </div>`;
}

function buildGroupText_(items, config, today) {
  const lines = [`${today} の物件情報`, `新着物件 ${items.length} 件`, ''];
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
  lines.push(config.UNSUBSCRIBE_TEXT || '配信停止をご希望の場合は返信でご連絡ください。');
  lines.push(`送信者: ${config.SENDER_NAME || '物件配信'}`);
  return lines.join('\n');
}

function writeRows_(ss, sheetName, headers, rows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clearContents();
  sheet.appendRow(headers);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function isGroupSendDay_(config) {
  const days = String(config.GROUP_SEND_DAYS || GROUP_DEFAULTS.GROUP_SEND_DAYS).split(',').map(s => s.trim().toUpperCase().slice(0, 3));
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEE').toUpperCase().slice(0, 3);
  return days.includes(today);
}

function parseGroupDays_(value) {
  const map = { MON: ScriptApp.WeekDay.MONDAY, TUE: ScriptApp.WeekDay.TUESDAY, WED: ScriptApp.WeekDay.WEDNESDAY, THU: ScriptApp.WeekDay.THURSDAY, FRI: ScriptApp.WeekDay.FRIDAY, SAT: ScriptApp.WeekDay.SATURDAY, SUN: ScriptApp.WeekDay.SUNDAY };
  return String(value || GROUP_DEFAULTS.GROUP_SEND_DAYS).split(',').map(s => s.trim().toUpperCase().slice(0, 3)).filter(d => map[d]).map(d => map[d]);
}
