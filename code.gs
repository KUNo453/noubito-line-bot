/************************************************************
 * PART 1: スプレッドシート設定
 ************************************************************/
const SHEET_ID = "1TKQKKMk5I8qK-0hWCuRKaRbb2Pc7BEeH299p2WakZiI";
const SHEET_NAME = "回答";

/************************************************************
 * PART 2: GET（フォーム表示）
 ************************************************************/
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("day_form")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/************************************************************
 * PART 3: POST（フォーム → スプレッドシート保存）
 ************************************************************/
function saveDayForm(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME);

  sh.appendRow([
    data.userId || "web-user",
    Number(data.day),
    data.text,
    new Date()
  ]);

  return "ok";
}

/************************************************************
 * PART 0: 共通設定・ユーティリティ（強化版）
 ************************************************************/
const PROP = (() => {
  const p = PropertiesService.getScriptProperties();
  const get = (k, def='') => {
    const v = p.getProperty(k);
    return v ? String(v).trim() : def;
  };
  const C = {
    OPENAI_API_KEY:       get('OPENAI_API_KEY'),
    OPENWEATHER_API_KEY:  get('OPENWEATHER_API_KEY'),
    CHANNEL_ACCESS_TOKEN: get('CHANNEL_ACCESS_TOKEN'),
    CITY_NAME:            get('CITY_NAME', ''),
    // ★ 追加（管理シート）
    SHEET_ID_M:           get('SHEET_ID_M'),
    SHEET_ID_N:           get('SHEET_ID_N'),
    // ★ 追加（エラーメールの送信先）
    ADMIN_EMAIL:          get('ADMIN_EMAIL', ''),
  };
  // 最低限の必須チェック（稼働前に気付ける）
  const missing = [];
  ['CHANNEL_ACCESS_TOKEN'].forEach(k => { if (!C[k]) missing.push(k); });
  if (missing.length) Logger.log('⚠️ Missing Script Properties: ' + missing.join(', '));
  return C;
})();


/************************************************************
 * PART 0: ログ通知ユーティリティ（Gmail通知対応）
 * ※チームの場合Slackが有料ならSlackへ送る
 ************************************************************/
function logErr(msg, err) {
  const errorText = `❌ ERROR: ${msg}\n${err && err.stack ? err.stack : err}`;
  Logger.log(errorText);

  // ADMIN_EMAIL が未設定ならメール送信しない
  if (!PROP.ADMIN_EMAIL) return;

  try {
    GmailApp.sendEmail(
      PROP.ADMIN_EMAIL,
      `【noubito GAS】エラー発生: ${msg}`,
      `日時: ${new Date().toLocaleString('ja-JP')}\n\n${errorText}`
    );
  } catch (e) {
    Logger.log('⚠️ Gmail送信に失敗しました: ' + e);
  }
}

/**★★★★★★★★★★★★一旦残すコード★★★★★★★★★★★★★★★★★★★★★*/
/**★★★★★★★★★★★★一旦残すコード★★★★★★★★★★★★★★★★★★★★★*/
// 指定スプレッドシートを開く（ID または URL どちらでもOK）＋タブ名で取得
//  - /d/{ID}/ 形式 と ?id=ID 形式 の両方から抽出

function openSheetByIdAndName(sheetIdOrUrl, sheetName) {
  const extractId = (s) => {
    if (!s) return '';
    const str = String(s).trim();
    // 1) /d/{ID}/ パターン
    let m = str.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
    // 2) ?id= または &id= パターン（drive の「open?id=...」等）
    m = str.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
    // 3) それ以外はそのまま（すでにIDだけが入っている想定）
    return str;
  };
  const id = extractId(sheetIdOrUrl);
  if (!id) throw new Error('Sheet ID is empty. Check Script Properties: SHEET_ID_M / SHEET_ID_N');
  logInfo('openSheetByIdAndName.extract', { given: sheetIdOrUrl, extractedId: id, sheetName });

  let ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(`openById failed. Given="${sheetIdOrUrl}" extracted="${id}". Use ONLY the spreadsheet ID. Original error: ${e}`);
  }
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet not found: "${sheetName}" in spreadsheet id=${id}`);
  return sh;
}
/** シートのヘッダー行（1 行目）を配列で取得 */
function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
}
/** ヘッダー名で列（1-based）を返す。見つからなければ 0。 */
function colByHeader(sheet, headerNames) {
  const headers = getHeaders(sheet);
  const names = Array.isArray(headerNames) ? headerNames : [headerNames];
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx + 1;
  }
  return 0;
}
/** A列(userId)で行を探す。無ければ appendRow して行番号（1-based）を返す。 */
function upsertRowByUserId(sheet, userId) {
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === userId) return r + 1;
  }
  sheet.appendRow([userId]);
  return sheet.getLastRow();
}

/**★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★*/

/************************************************************
 * PART 0: 列番号（COL_定数）まとめ
 * 全 Day の列名を集中管理する
 ************************************************************/
const COL = {
  // Day7（あなたのシート入力内容より）
  DAY7_ACTION_REASON:   "Day7_行動理由",
  DAY7_EMOTION_MOTIVE:  "Day7_感情動機",
  DAY7_IFTHEN:          "Day7_IfThen",

  // Day8
  DAY8_MIN_ACTION:      "Day8_最小一手",
  DAY8_GOAL_IMAGE:      "Day8_到達点イメージ",
  DAY8_IFTHEN:          "Day8_IfThen",

  // Day9
  DAY9_OBSTACLE:        "Day9_障害パターン",
  DAY9_RECONNECT:       "Day9_再接続ルール",
  DAY9_SELF_SCHEME:     "Day9_自己スキーム化",

  // Day10
  DAY10_OBS:            "Day10_観察現象",
  DAY10_AUTO_MEANING:   "Day10_自動的意味づけ",
  DAY10_PREMISE:        "Day10_前提",
  DAY10_REFRAME_Q:      "Day10_問い直し",
  DAY10_NEW_MEANING:    "Day10_新しい意味づけ",

  // Day11
  DAY11_ACTION:         "Day11_選択行動",
  DAY11_EXPLICIT:       "Day11_判断基準_明示",
  DAY11_IMPLICIT:       "Day11_暗黙の価値観",
  DAY11_PRIORITY:       "Day11_本来の優先",
  DAY11_RESELECT:       "Day11_再選択",

  // Day12
  DAY12_EMO_LABEL:      "Day12_感情ラベル",
  DAY12_CONTEXT:        "Day12_文脈",
  DAY12_MEANING:        "Day12_感情の意味",
  DAY12_VALUE:          "Day12_守りたかった価値",
  DAY12_TAG:            "Day12_ラベリング",

  // Day13
  DAY13_PATTERN:        "Day13_思考パターン",
  DAY13_ORIGIN:         "Day13_起点場面",
  DAY13_ORIGINAL_MEAN:  "Day13_意味づけ",
  DAY13_REINFORCE:      "Day13_強化経緯",
  DAY13_CURRENT:        "Day13_現在の解釈"
};


/************************************************************
 * PART 1: 外部APIクライアント
 * - 実処理は PART 20（sendTextMessage / callChatGPTFromOpenAI / getWeather）を利用
 * - 注意：getWeather は PART 20 にあるため、ここでは定義しない（重複回避）
 ************************************************************/
 // LINEメッセージを送るための関数を定義
 function linePushText(userId, text) {

 // （本体はPART 20）を呼んで、実際にLINEにメッセージを送信
  try {
    return sendTextMessage(userId, text);

 // もし送信に失敗したら、logErr()（Gmail通知付きエラーログ関数）で記録・通知して終了
  } catch (e) {
    logErr('linePushText(wrapper)', e);
    return;
  }
}
// GPTに文章を送る（OpenAI APIを呼ぶ）関数
function callChatGPT(textPrompt) {
  try {
    return callChatGPTFromOpenAI(textPrompt);
  } catch (e) {
    logErr('callChatGPT(wrapper)', e);
    return '';
  }
}
//  getWeather は PART 20 に実体があるため、ここでは再定義しません。getWeather() 呼び出しは PART 20 の実装が呼ばれます。

/************************************************************
 * PART 2: Webhook 入口（受付・整形）
 ************************************************************/
// （任意）表示名取得
function getLineDisplayName(userId) {
  try {
    const url = `https://api.line.me/v2/bot/profile/${userId}`;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + PROP.CHANNEL_ACCESS_TOKEN },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      try { logErr('getLineDisplayName http', res.getResponseCode() + ' ' + res.getContentText()); } catch(_){}
      return '';
    }
    const json = JSON.parse(res.getContentText());
    return String(json?.displayName || '');
  } catch (e) {
    try { logErr('getLineDisplayName', e); } catch(_){}
    return '';
  }
}

// Webhook エントリーポイント
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    const json = JSON.parse(e.postData.contents);
    const events = Array.isArray(json.events) ? json.events : [];

    for (let i = 0; i < events.length; i++) {
      handleLineEvent_(events[i], e); // ← PART 3 に分ける本体
    }

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    try { logErr('doPost', err); } catch(_){}
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  }
}
/************************************************************
 * PART 3: メッセージ解析とルーティング本体（完全統合版）
 ************************************************************/
function handleLineEvent_(event, rawE) {
  try {
    const userId  = event?.source?.userId;
    const isText  = event?.type === 'message' && event?.message?.type === 'text';
    const rawText = isText ? String(event.message.text || '') : '';
    if (!userId || !rawText) return;

    // 整形
    const text         = rawText.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
    const textNoSpaces = text.replace(/\s/g, '');
    Logger.log(`💬 [LINE受信] ${userId}: ${text}`);

    /******************************************************
     * ① スタート登録
     ******************************************************/
    if (/^スタート$/i.test(textNoSpaces)) {
      const name = getLineDisplayName(userId) || '';
      if (typeof registerUserIfNotExists_ === 'function') {
        registerUserIfNotExists_(userId, name);
      }
      if (typeof sendInitialProfileRequest === 'function') {
        sendInitialProfileRequest(userId);
      } else {
        sendTextMessage(
          userId,
          "登録が完了しました🌿\n次にMBTIを入力してください（例：INFJ）。\n分からなければ「スキップ」と入力してください。"
        );
      }
      return;
    }

    /******************************************************
     * ② MBTI または スキップ
     ******************************************************/
    const mbtiPattern = /^[IEie][NSns][FTft][JPjp]$/;
    if (
      typeof handleMbtiOrSkip === 'function' &&
      (mbtiPattern.test(textNoSpaces) ||
       /^スキップ$/i.test(textNoSpaces) ||
       /^不明$/i.test(textNoSpaces))
    ) {
      handleMbtiOrSkip(userId, text);
      return;
    }

    /******************************************************
     * ③ Day1：観察仮説
     ******************************************************/
    if (
      /^#?Day\s*1\b/i.test(text) ||
      text.startsWith("#観察現象") ||
      text.startsWith("#IfThen1")
    ) {
      if (typeof processDay1 === 'function') processDay1(userId, text);
      return;
    }

    /******************************************************
     * ④ Day2：構造分解
     ******************************************************/
    if (
      /^#?Day\s*2\b/i.test(text) ||
      text.startsWith("#引き金") ||
      text.startsWith("#連鎖") ||
      text.startsWith("#詰まり") ||
      text.startsWith("#名前")
    ) {
      if (typeof processDay2 === 'function') processDay2(userId, text);
      return;
    }

    /******************************************************
     * ⑤ Day3：妨害要因
     ******************************************************/
    if (
      /^#?Day\s*3\b/i.test(text) ||
      text.startsWith("#妨害現象") ||
      text.startsWith("#止まる理由") ||
      text.startsWith("#IfThen3")
    ) {
      if (typeof processDay3 === 'function') processDay3(userId, text);
      return;
    }

    /******************************************************
     * ⑥ Day4〜9（Day6〜9：会話型）
     ******************************************************/
    if (/^#?Day\s*([4-9])\b/i.test(text) &&
        typeof handleDay6to9Conversation_ === 'function') {
      handleDay6to9Conversation_(userId, text);
      return;
    }

    /******************************************************
     * ⑦ Day10〜16（返信不可）
     ******************************************************/
    if (/^#?Day\s*(1[0-6])\b/i.test(text)) {
      sendTextMessage(userId, "この期間は自動配信のみです🌤\nそのまま読んでいただくだけで大丈夫です。");
      return;
    }

    /******************************************************
     * ⑧ Day17〜29：本文／例を見る／pending
     ******************************************************/
    const mExample = text.match(/^#?Day\s*(1[7-9]|2[0-9])\s*例を見る$/i);
    if (mExample && typeof handleExampleRequest === 'function') {
      handleExampleRequest(userId, Number(mExample[1]));
      return;
    }

    const mDay17to29 = text.match(/^#?Day\s*(1[7-9]|2[0-9])\b/i);
    if (mDay17to29 && typeof processDay17to29Answer === 'function') {
      processDay17to29Answer(userId, text, Number(mDay17to29[1]));
      return;
    }

    if (typeof getPendingDay_ === 'function') {
      const pending = Number(getPendingDay_(userId));
      if (pending >= 17 && pending <= 29) {
        processDay17to29Answer(userId, text, pending);
        if (typeof clearPendingDay_ === 'function') clearPendingDay_(userId);
        return;
      }
    }

    /******************************************************
     * ⑨ Day25〜30：自由記述の保存処理ルーティング（完成版）
     ******************************************************/
    if (routeDay25to30_(userId, text)) {
      return;
    }

    /******************************************************
     * ⑩ 任意ハッシュタグ
     ******************************************************/
    if (/#\w+/.test(text) &&
        typeof handleFreeHashtagToNoubito === 'function') {
      handleFreeHashtagToNoubito(userId, text);
      return;
    }

    /******************************************************
     * ⑪ その他：未分類
     ******************************************************/
    sendTextMessage(userId, "メッセージを受け取りました🌿");

  } catch (err) {
    logErr('handleLineEvent_', err);
  }
}

/************************************************************
 * PART 4: LINE Webhook 受信エントリーポイント（統合版）
 ************************************************************/
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      Logger.log('⚠️ doPost: postData が空です。');
      return ContentService.createTextOutput('No data');
    }

    const data   = JSON.parse(e.postData.contents);
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length === 0) {
      Logger.log('⚠️ doPost: events が存在しません。');
      return ContentService.createTextOutput('No events');
    }

    events.forEach(event => {
      try {
        handleLineEvent_(event, e);
      } catch (innerErr) {
        logErr('handleLineEvent_', innerErr);
      }
    });

    return ContentService.createTextOutput('OK');
  } catch (err) {
    logErr('doPost', err);
    return ContentService.createTextOutput('Error');
  }
}

/************************************************************
 * PART 5: MBTI登録のタブ名・存在チェックと案内メッセージ（完成版）
 ************************************************************/
function handleMbtiOrSkip(userId, text) {
  try {
    const sheetId   = PROP.SHEET_ID_M;   // 管理シートID
    const sheetName = "LINE";            // 実際のタブ名に合わせる

    if (!sheetId) {
      throw new Error("SHEET_ID_M が未設定です。Script Properties を確認してください。");
    }

    const sheet   = openSheetByIdAndName(sheetId, sheetName);
    const row     = upsertRowByUserId(sheet, userId);
    const colMbti = colByHeader(sheet, "MBTI");

    if (!colMbti) {
      throw new Error(`MBTI列が見つかりません（タブ: ${sheetName}）。`);
    }

    // 入力値を整形（大文字・空白除去）
    let mbtiValue = String(text || "").trim().toUpperCase().replace(/\s/g, "");

    // スキップ・不明 → 未設定
    if (/^スキップ$/i.test(mbtiValue) || /^不明$/i.test(mbtiValue)) {
      mbtiValue = "未設定";
    } else if (!/^[IE][NS][FT][JP]$/i.test(mbtiValue)) {
      // フォーマット不正
      sendTextMessage(
        userId,
        "MBTIの形式が正しくありません。\n" +
        "例：INFJ / ESTP / INFP のように4文字で入力してください。\n" +
        "分からなければ「スキップ」と入力してください。"
      );
      return;
    }

    // シートに保存
    sheet.getRange(row, colMbti).setValue(mbtiValue);

    // ユーザーへの案内メッセージ
    const msg =
      mbtiValue === "未設定"
        ? "MBTIは未設定のまま進みます🌱\n明日の朝6時頃にDay1のメッセージをお届けします。"
        : `MBTIを「${mbtiValue}」として登録しました🌿\n明日の朝6時頃にDay1のメッセージをお届けします。`;

    sendTextMessage(userId, msg);

    // Day0 のウェルカムメッセージ（あれば）
    if (typeof sendDay0WelcomeMessage === "function") {
      sendDay0WelcomeMessage(userId, mbtiValue);
    }

  } catch (err) {
    logErr("handleMbtiOrSkip", err);
    sendTextMessage(userId, "MBTIの登録でエラーが発生しました。時間をおいて再試行してください。");
  }
}

/************************************************************
 * PART 6: Day1〜3 保存ディスパッチャ
 ************************************************************/
function handleDay1to3Save(userId, text) {
  const sheet = openSheetByIdAndName(PROP.SHEET_ID_M, "noubito_回答");
  const row = upsertRowByUserId(sheet, userId);
  const timestamp = new Date();

  // Day番号を抽出
  const m = text.match(/^#?Day\s*(\d+)\s*(.*)$/i);
  if (!m) return;
  const day = Number(m[1]);
  const body = String(m[2] || "").trim();

  switch (day) {

    /***************************
     * Day1
     ***************************/
    case 1:
      if (/^#?観察/i.test(body)) {
        const val = body.replace(/^#?観察[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day1_観察")).setValue(val);
      } else if (/^#?ifthen/i.test(body)) {
        const val = body.replace(/^#?ifthen[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day1_IfThen")).setValue(val);
      }
      break;

    /***************************
     * Day2
     ***************************/
    case 2:
      if (/^#?引き金/i.test(body)) {
        const val = body.replace(/^#?引き金[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day2_引き金")).setValue(val);
      } else if (/^#?連鎖/i.test(body)) {
        const val = body.replace(/^#?連鎖[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day2_連鎖")).setValue(val);
      } else if (/^#?詰まり/i.test(body)) {
        const val = body.replace(/^#?詰まり[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day2_詰まり")).setValue(val);
      } else if (/^#?名前/i.test(body)) {
        const val = body.replace(/^#?名前[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day2_名前")).setValue(val);
      }
      break;

    /***************************
     * Day3
     ***************************/
    case 3:
      if (/^#?妨害現象/i.test(body)) {
        const val = body.replace(/^#?妨害現象[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day3_妨害現象")).setValue(val);
      } else if (/^#?止まる理由/i.test(body)) {
        const val = body.replace(/^#?止まる理由[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day3_止まる理由")).setValue(val);
      } else if (/^#?ifthen/i.test(body)) {
        const val = body.replace(/^#?ifthen[＝=:\s]*/i, "");
        sheet.getRange(row, colByHeader(sheet, "Day3_IfThen")).setValue(val);
      }
      break;
  }

  // 共通保存：timestamp
  sheet.getRange(row, colByHeader(sheet, "timestamp")).setValue(timestamp);
}

/************************************************************
 * PART 7: Day1〜3 保存処理（完成版）
 ************************************************************/

/************************************************************
 * Day1：観察仮説（#観察現象 / #IfThen1）
 ************************************************************/
function processDay1(userId, text) {
  try {
    const sheet = openSheetByIdAndName(PROP.SHEET_ID_M, "LINE");
    const row   = upsertRowByUserId(sheet, userId);

    const map = {
      "#観察現象": "Day1_観察現象",
      "#IfThen1": "Day1_IfThen"
    };

    let saved = false;

    for (const tag in map) {
      if (text.startsWith(tag)) {
        const col = colByHeader(sheet, map[tag]);
        if (col) {
          const value = text.replace(tag, "").trim();
          sheet.getRange(row, col).setValue(value);
          saved = true;
        }
      }
    }

    if (saved) {
      sendTextMessage(userId, "Day1 の回答を記録しました🌿");
    } else {
      sendTextMessage(userId, "Day1 の入力形式が確認できませんでした。");
    }

  } catch (err) {
    logErr("processDay1", err);
    sendTextMessage(userId, "Day1 の保存でエラーが発生しました。");
  }
}

/************************************************************
 * Day2：構造分解（#引き金 / #連鎖 / #詰まり / #名前）
 ************************************************************/
function processDay2(userId, text) {
  try {
    const sheet = openSheetByIdAndName(PROP.SHEET_ID_M, "LINE");
    const row   = upsertRowByUserId(sheet, userId);

    const map = {
      "#引き金": "Day2_引き金",
      "#連鎖":   "Day2_連鎖",
      "#詰まり": "Day2_詰まり",
      "#名前":   "Day2_名前"
    };

    let saved = false;

    for (const tag in map) {
      if (text.startsWith(tag)) {
        const col = colByHeader(sheet, map[tag]);
        if (col) {
          const value = text.replace(tag, "").trim();
          sheet.getRange(row, col).setValue(value);
          saved = true;
        }
      }
    }

    if (saved) {
      sendTextMessage(userId, "Day2 の回答を記録しました🌿");
    } else {
      sendTextMessage(userId, "Day2 の入力形式が確認できませんでした。");
    }

  } catch (err) {
    logErr("processDay2", err);
    sendTextMessage(userId, "Day2 の保存でエラーが発生しました。");
  }
}

/************************************************************
 * Day3：妨害要因（#妨害現象 / #止まる理由 / #IfThen3）
 ************************************************************/
function processDay3(userId, text) {
  try {
    const sheet = openSheetByIdAndName(PROP.SHEET_ID_M, "LINE");
    const row   = upsertRowByUserId(sheet, userId);

    const map = {
      "#妨害現象": "Day3_妨害現象",
      "#止まる理由": "Day3_止まる理由",
      "#IfThen3":    "Day3_IfThen"
    };

    let saved = false;

    for (const tag in map) {
      if (text.startsWith(tag)) {
        const col = colByHeader(sheet, map[tag]);
        if (col) {
          const value = text.replace(tag, "").trim();
          sheet.getRange(row, col).setValue(value);
          saved = true;
        }
      }
    }

    if (saved) {
      sendTextMessage(userId, "Day3 の回答を記録しました🌿");
    } else {
      sendTextMessage(userId, "Day3 の入力形式が確認できませんでした。");
    }

  } catch (err) {
    logErr("processDay3", err);
    sendTextMessage(userId, "Day3 の保存でエラーが発生しました。");
  }
}

/************************************************************
 * PART 7: Day4〜6 ルーティング拡張（新仕様対応）
 * - Day4：五感スイッチ（#五感スイッチ / #場面文脈 / #IfThen）
 * - Day5：環境スイッチ（#環境要因 / #反応変化 / #IfThen）
 * - Day6：テーマ抽出（#主観テーマ / #反復ワード / #IfThen）
 ************************************************************/
function handleLineEvent_Day4to6(userId, text) {

  /******************************************************
   * Day4（五感スイッチ）
   ******************************************************/
  if (
    /^#?Day\s*4\b/i.test(text) ||
    text.startsWith("#五感スイッチ") ||
    text.startsWith("#場面文脈") ||
    text.startsWith("#IfThen")
  ) {
    if (typeof processDay4 === 'function') {
      processDay4(userId, text);
    } else {
      sendTextMessage(userId, "Day4 の処理が未実装です。");
    }
    return true;
  }

  /******************************************************
   * Day5（環境スイッチ）
   ******************************************************/
  if (
    /^#?Day\s*5\b/i.test(text) ||
    text.startsWith("#環境要因") ||
    text.startsWith("#反応変化") ||
    text.startsWith("#IfThen")
  ) {
    if (typeof processDay5 === 'function') {
      processDay5(userId, text);
    } else {
      sendTextMessage(userId, "Day5 の処理が未実装です。");
    }
    return true;
  }

  /******************************************************
   * Day6（テーマ抽出）
   ******************************************************/
  if (
    /^#?Day\s*6\b/i.test(text) ||
    text.startsWith("#主観テーマ") ||
    text.startsWith("#反復ワード") ||
    text.startsWith("#IfThen")
  ) {
    if (typeof processDay6 === 'function') {
      processDay6(userId, text);
    } else {
      sendTextMessage(userId, "Day6 の処理が未実装です。");
    }
    return true;
  }

  return false; // Day4〜6 ではない
}

/************************************************************
 * PART 8: Day4〜6 保存処理
 ************************************************************/
/************************************************************
 * 共通：保存ユーティリティ
 ************************************************************/
function saveToSheet(sheetId, sheetName, userId, valuesObj) {
  const sheet = openSheetByIdAndName(sheetId, sheetName);
  const row   = upsertRowByUserId(sheet, userId);
  const tsCol = colByHeader(sheet, "timestamp");

  // 各フィールドを保存
  Object.keys(valuesObj).forEach(key => {
    const col = colByHeader(sheet, key);
    if (col) sheet.getRange(row, col).setValue(valuesObj[key]);
  });

  // タイムスタンプ更新
  if (tsCol) sheet.getRange(row, tsCol).setValue(new Date());
}

/************************************************************
 * Day4 保存処理：五感スイッチ
 ************************************************************/
function processDay4(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  // Day番号
  const dayNumber = 4;

  // プレフィックスによる分類
  let sensorySwitch = "";
  let situationContext = "";
  let ifThenRule = "";

  if (/^#?Day\s*4\b/i.test(text)) {
    // 何も指定なし — Day番号だけ送る場合
  } else if (text.startsWith("#五感スイッチ")) {
    sensorySwitch = text.replace(/^#?五感スイッチ[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#場面文脈")) {
    situationContext = text.replace(/^#?場面文脈[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  // 保存
  saveToSheet(sheetId, sheetName, userId, {
    dayNumber,
    sensorySwitch,
    situationContext,
    ifThenRule
  });

  sendTextMessage(userId, "Day4 を受け取りました🌱");
}

/************************************************************
 * Day5 保存処理：環境スイッチ
 ************************************************************/
function processDay5(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  const dayNumber = 5;

  let environmentFactor = "";
  let responseChange = "";
  let ifThenRule = "";

  if (/^#?Day\s*5\b/i.test(text)) {
    // Day番号だけ
  } else if (text.startsWith("#環境要因")) {
    environmentFactor = text.replace(/^#?環境要因[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#反応変化")) {
    responseChange = text.replace(/^#?反応変化[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  saveToSheet(sheetId, sheetName, userId, {
    dayNumber,
    environmentFactor,
    responseChange,
    ifThenRule
  });

  sendTextMessage(userId, "Day5 を受け取りました🌿");
}

/************************************************************
 * Day6 保存処理：テーマ抽出
 ************************************************************/
function processDay6(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  const dayNumber = 6;

  let themeFocus = "";
  let repeatedWords = "";
  let ifThenRule = "";

  if (/^#?Day\s*6\b/i.test(text)) {
    // Day番号だけ
  } else if (text.startsWith("#主観テーマ")) {
    themeFocus = text.replace(/^#?主観テーマ[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#反復ワード")) {
    repeatedWords = text.replace(/^#?反復ワード[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  saveToSheet(sheetId, sheetName, userId, {
    dayNumber,
    themeFocus,
    repeatedWords,
    ifThenRule
  });

  sendTextMessage(userId, "Day6 を受け取りました✨");
}

/************************************************************
 * PART 9: Day4〜9 メッセージ分岐ハンドラ（会話型・例文対応）
 * - handleLineEvent_ から呼ばれる
 * - Day4〜6: 既存の processDay4 / 5 / 6 を呼び出し
 * - Day7〜9: 例リクエスト（「#Day7 例を見る」など）＋保存処理
 ************************************************************/
function handleDay6to9Conversation_(userId, text) {
  try {
    // Day番号＋残りテキスト抽出
    const m = text.match(/^#?Day\s*(\d+)\s*(.*)$/i);
    if (!m) {
      sendTextMessage(userId, "Day番号の形式が確認できませんでした。");
      return;
    }

    const dayNumber = Number(m[1]);        // 4〜9 を想定
    const rest = (m[2] || "").trim();     // 「#行動理由〜」など Dayタグ以降
    const isExampleRequest = /例を見る/.test(rest);

    switch (dayNumber) {
      /******************************************************
       * Day4：五感スイッチ（既存処理を呼び出し）
       ******************************************************/
      case 4:
        if (typeof processDay4 === "function") {
          const payload = rest && rest.startsWith("#") ? rest : text;
          processDay4(userId, payload);
        } else {
          sendTextMessage(userId, "Day4 の処理が未実装です。");
        }
        return;

      /******************************************************
       * Day5：環境スイッチ（既存処理を呼び出し）
       ******************************************************/
      case 5:
        if (typeof processDay5 === "function") {
          const payload = rest && rest.startsWith("#") ? rest : text;
          processDay5(userId, payload);
        } else {
          sendTextMessage(userId, "Day5 の処理が未実装です。");
        }
        return;

      /******************************************************
       * Day6：テーマ抽出（既存処理を呼び出し）
       ******************************************************/
      case 6:
        if (typeof processDay6 === "function") {
          const payload = rest && rest.startsWith("#") ? rest : text;
          processDay6(userId, payload);
        } else {
          sendTextMessage(userId, "Day6 の処理が未実装です。");
        }
        return;

      /******************************************************
       * Day7：理由化・動機分析
       ******************************************************/
      case 7:
        if (isExampleRequest) {
          const exampleMsg =
            "▼ #行動理由 例\n" +
            "・間違えないようにしている\n" +
            "・相手に悪く思われたくない\n" +
            "・やるからには完璧にしたい\n" +
            "・場がシラけるのが嫌\n\n" +
            "▼ #感情動機 例\n" +
            "・評価されたい／嫌われたくない\n" +
            "・自分を守りたい／不安を避けたい\n" +
            "・成果が出ないと無価値に思える\n" +
            "・責任を果たさないといけない感じ\n\n" +
            "▼ #IfThen 例\n" +
            "・「“嫌われたくない”が浮かんだら→深呼吸＋一呼吸置く」\n" +
            "・「“完璧にしたい”が強まったら→6割で一度提出」\n" +
            "・「“失いたくない”が来たら→立って姿勢を変える」";
          sendTextMessage(userId, exampleMsg);
          return;
        }

        if (typeof processDay7 === "function") {
          const payload = rest && rest.startsWith("#") ? rest : text;
          processDay7(userId, payload);
        } else {
          sendTextMessage(userId, "Day7 の処理が未実装です。");
        }
        return;

      /******************************************************
       * Day8：一手と到達点設定
       ******************************************************/
      case 8:
        if (isExampleRequest) {
          const exampleMsg =
            "▼ #最小一手 例\n" +
            "・冒頭5分の内容を下書きだけする\n" +
            "・10件だけリストアップして止める\n" +
            "・“3分だけ手を動かす”をタイマーでやる\n\n" +
            "▼ #到達点イメージ 例\n" +
            "・タイマーが鳴った\n" +
            "・紙1枚に要素を書けた\n" +
            "・メール1本下書きしたら完了\n\n" +
            "▼ #IfThen 例\n" +
            "・「集中が切れたら→立って姿勢を変える」\n" +
            "・「SNSに手が伸びたら→携帯を自分と別の部屋に置く」\n" +
            "・「止まりそうになったら→“やったら終われる”と声に出す」";
          sendTextMessage(userId, exampleMsg);
          return;
        }

        if (typeof processDay8 === "function") {
          const payload = rest && rest.startsWith("#") ? rest : text;
          processDay8(userId, payload);
        } else {
          sendTextMessage(userId, "Day8 の処理が未実装です。");
        }
        return;

      /******************************************************
       * Day9：障害と回避の統合
       ******************************************************/
      case 9:
        if (isExampleRequest) {
          const exampleMsg =
            "▼ #障害パターン 例\n" +
            "・午後になると決断が鈍る\n" +
            "・失敗を連想すると動きが止まる\n" +
            "・上司の顔を思い出すと避けたくなる\n\n" +
            "▼ #再接続ルール 例\n" +
            "・一旦外に出る／飲み物を変える\n" +
            "・「ここまでやっただけでOK」と声に出す\n" +
            "・TODOを3分だけ書き直す\n\n" +
            "▼ #自己スキーム化 例\n" +
            "・不安になると先延ばし→深呼吸→次の1分だけ決める\n" +
            "・完璧主義で止まる→敢えて“雑”に始めてみる\n" +
            "・話したくなる→チャット下書きだけして保存";
          sendTextMessage(userId, exampleMsg);
          return;
        }

        if (typeof processDay9 === "function") {
          const payload = rest && rest.startsWith("#") ? rest : text;
          processDay9(userId, payload);
        } else {
          sendTextMessage(userId, "Day9 の処理が未実装です。");
        }
        return;

      default:
        // handleLineEvent_ 側の正規表現が間違っていない限り来ないはず
        sendTextMessage(userId, "Day4〜9 の範囲外の入力です。");
        return;
    }

  } catch (err) {
    logErr("handleDay6to9Conversation_", err);
    sendTextMessage(userId, "Day4〜9 の処理中にエラーが発生しました。");
  }
}

/************************************************************
 * PART 10: Day7 保存処理：理由化・動機分析
 * シート: PROP.SHEET_ID_M / タブ: noubito_回答
 * カラム: dayNumber(7), reasonAction, emotionalDriver, ifThenRule
 ************************************************************/
function processDay7(userId, text) {
  try {
    const sheetId   = PROP.SHEET_ID_M;
    const sheetName = "noubito_回答";
    const dayNumber = 7;

    let reasonAction    = "";
    let emotionalDriver = "";
    let ifThenRule      = "";

    if (/^#?Day\s*7\b/i.test(text)) {
      // Day番号だけ（イントロなど）→ dayNumber のみ保存したい場合
    } else if (text.startsWith("#行動理由")) {
      reasonAction = text.replace(/^#?行動理由[=：:\s]*/i, "").trim();
    } else if (text.startsWith("#感情動機")) {
      emotionalDriver = text.replace(/^#?感情動機[=：:\s]*/i, "").trim();
    } else if (text.startsWith("#IfThen")) {
      ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
    }

    saveToSheet(sheetId, sheetName, userId, {
      dayNumber,
      reasonAction,
      emotionalDriver,
      ifThenRule
    });

    sendTextMessage(userId, "Day7 を受け取りました🌿");
  } catch (err) {
    logErr("processDay7", err);
    sendTextMessage(userId, "Day7 の保存でエラーが発生しました。");
  }
}

/************************************************************
 * PART 11: Day8 保存処理：一手と到達点設定
 * シート: PROP.SHEET_ID_M / タブ: noubito_回答
 * カラム: dayNumber(8), minimalAction, doneCriteria, ifThenRule
 ************************************************************/
function processDay8(userId, text) {
  try {
    const sheetId   = PROP.SHEET_ID_M;
    const sheetName = "noubito_回答";
    const dayNumber = 8;

    let minimalAction = "";
    let doneCriteria  = "";
    let ifThenRule    = "";

    if (/^#?Day\s*8\b/i.test(text)) {
      // Day番号だけ
    } else if (text.startsWith("#最小一手")) {
      minimalAction = text.replace(/^#?最小一手[=：:\s]*/i, "").trim();
    } else if (text.startsWith("#到達点イメージ")) {
      doneCriteria = text.replace(/^#?到達点イメージ[=：:\s]*/i, "").trim();
    } else if (text.startsWith("#IfThen")) {
      ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
    }

    saveToSheet(sheetId, sheetName, userId, {
      dayNumber,
      minimalAction,
      doneCriteria,
      ifThenRule
    });

    sendTextMessage(userId, "Day8 を受け取りました🎯");
  } catch (err) {
    logErr("processDay8", err);
    sendTextMessage(userId, "Day8 の保存でエラーが発生しました。");
  }
}

/************************************************************
 * PART 12: Day9 保存処理：障害と回避の統合
 * シート: PROP.SHEET_ID_M / タブ: noubito_回答
 * カラム: dayNumber(9), obstaclePattern, reconnectRule, selfScheme
 ************************************************************/
function processDay9(userId, text) {
  try {
    const sheetId   = PROP.SHEET_ID_M;
    const sheetName = "noubito_回答";
    const dayNumber = 9;

    let obstaclePattern = "";
    let reconnectRule   = "";
    let selfScheme      = "";

    if (/^#?Day\s*9\b/i.test(text)) {
      // Day番号だけ
    } else if (text.startsWith("#障害パターン")) {
      obstaclePattern = text.replace(/^#?障害パターン[=：:\s]*/i, "").trim();
    } else if (text.startsWith("#再接続ルール")) {
      reconnectRule = text.replace(/^#?再接続ルール[=：:\s]*/i, "").trim();
    } else if (text.startsWith("#自己スキーム化")) {
      selfScheme = text.replace(/^#?自己スキーム化[=：:\s]*/i, "").trim();
    }

    saveToSheet(sheetId, sheetName, userId, {
      dayNumber,
      obstaclePattern,
      reconnectRule,
      selfScheme
    });

    sendTextMessage(userId, "Day9 を受け取りました🔄");
  } catch (err) {
    logErr("processDay9", err);
    sendTextMessage(userId, "Day9 の保存でエラーが発生しました。");
  }
}

/************************************************************
 * PART 13:Day7保存処理：行動理由・感情動機・IfThen
 ************************************************************/
function processDay7(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  const sheet = openSheetByIdAndName(sheetId, sheetName);
  const row   = upsertRowByUserId(sheet, userId);

  let actionReason = "";
  let emotionMotive = "";
  let ifThenRule = "";

  // Day7：3つのタグで分岐
  if (text.startsWith("#行動理由")) {
    actionReason = text.replace(/^#行動理由[=：:\s]*/i, "").trim();
  } 
  else if (text.startsWith("#感情動機")) {
    emotionMotive = text.replace(/^#感情動機[=：:\s]*/i, "").trim();
  } 
  else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  // 保存（あなたの列名に完全一致）
  const saveObj = {};
  if (actionReason)  saveObj["Day7_行動理由"]   = actionReason;
  if (emotionMotive) saveObj["Day7_感情動機"]   = emotionMotive;
  if (ifThenRule)    saveObj["Day7_IfThen"]     = ifThenRule;

  if (Object.keys(saveObj).length > 0) {
    saveToSheet(sheetId, sheetName, userId, saveObj);
    sendTextMessage(userId, "Day7 を受け取りました🌿");
  } else {
    sendTextMessage(userId, "Day7 の入力形式が確認できませんでした。");
  }
}
/************************************************************
 * PART 14: Day8 保存処理：最小一手・到達点イメージ・IfThen
 ************************************************************/
function processDay8(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  const dayNumber = 8;

  let minimalAction = "";
  let goalImage = "";
  let ifThenRule = "";

  // Day番号だけ送られた場合
  if (/^#?Day\s*8\b/i.test(text)) {
    // そのまま保存（空欄）
  } 
  // #最小一手
  else if (text.startsWith("#最小一手")) {
    minimalAction = text.replace(/^#?最小一手[=：:\s]*/i, "").trim();
  } 
  // #到達点イメージ
  else if (text.startsWith("#到達点イメージ")) {
    goalImage = text.replace(/^#?到達点イメージ[=：:\s]*/i, "").trim();
  } 
  // #IfThen
  else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  // 保存
  saveToSheet(sheetId, sheetName, userId, {
    dayNumber,
    Day8_最小一手: minimalAction,
    Day8_到達点イメージ: goalImage,
    Day8_IfThen: ifThenRule
  });

  sendTextMessage(userId, "Day8 を受け取りました💡");
}

/************************************************************
 * PART 14: Day8 保存処理：最小一手・到達点イメージ・IfThen
 ************************************************************/
function processDay8(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  const dayNumber = 8;

  let minAction = "";
  let targetImage = "";
  let ifThenRule = "";

  // Day番号だけ送る場合
  if (/^#?Day\s*8\b/i.test(text)) {
    // 何もしない（空保存）
  } else if (text.startsWith("#最小一手")) {
    minAction = text.replace(/^#?最小一手[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#到達点イメージ")) {
    targetImage = text.replace(/^#?到達点イメージ[=：:\s]*/i, "").trim();
  } else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  // 保存
  saveToSheet(sheetId, sheetName, userId, {
    dayNumber,
    Day8_最小一手: minAction,
    Day8_到達点イメージ: targetImage,
    Day8_IfThen: ifThenRule
  });

  sendTextMessage(userId, "Day8 を受け取りました📘");
}
/************************************************************
 * PART 15: Day9 保存処理：障害パターン・再接続ルール・自己スキーム化・IfThen
 ************************************************************/
function processDay9(userId, text) {
  const sheetId   = PROP.SHEET_ID_M;
  const sheetName = "noubito_回答";

  const dayNumber = 9;

  // 保存対象フィールド
  let 障害パターン = "";
  let 再接続ルール = "";
  let 自己スキーム化 = "";
  let ifThenRule = "";

  // Day番号だけ送られた場合
  if (/^#?Day\s*9\b/i.test(text)) {
    // 何も保存しない
  }
  // 各タグで振り分け
  else if (text.startsWith("#障害パターン")) {
    障害パターン = text.replace(/^#?障害パターン[=：:\s]*/i, "").trim();
  }
  else if (text.startsWith("#再接続ルール")) {
    再接続ルール = text.replace(/^#?再接続ルール[=：:\s]*/i, "").trim();
  }
  else if (text.startsWith("#自己スキーム化")) {
    自己スキーム化 = text.replace(/^#?自己スキーム化[=：:\s]*/i, "").trim();
  }
  else if (text.startsWith("#IfThen")) {
    ifThenRule = text.replace(/^#?IfThen[=：:\s]*/i, "").trim();
  }

  // 保存
  saveToSheet(sheetId, sheetName, userId, {
    dayNumber,
    Day9_障害パターン: 障害パターン,
    Day9_再接続ルール: 再接続ルール,
    Day9_自己スキーム化: 自己スキーム化,
    Day9_IfThen: ifThenRule
  });

  // 返信
  sendTextMessage(userId, "Day9 を受け取りました🌱");
}
/************************************************************
 * PART 14: Day10 保存処理（Reframe：枠組みの再定義）
 * 保存先列：
 * AJ: Day10_観察現象
 * AK: Day10_自動的意味づけ
 * AL: Day10_前提
 * AM: Day10_問い直し
 * AN: Day10_新しい意味づけ
 ************************************************************/
function processDay10Answer(userId, text) {
  try {
    const sheet = getNoubitoMainSheet_();
    const row = findUserRow_(sheet, userId);
    if (!row) {
      replyToUser(userId, "登録情報が見つかりませんでした。");
      return;
    }

    // ① 入力形式：#Day10 観察現象｜自動的意味づけ｜前提｜問い直し｜新しい意味づけ
    const cleaned = text.replace(/^#Day10/i, "").trim();
    const parts = cleaned.split("｜");

    if (parts.length < 5) {
      replyToUser(userId, "Day10の回答は「5つの項目」を ｜ で区切って送ってください。\n例）#Day10 ○○｜○○｜○○｜○○｜○○");
      return;
    }

    const observed = parts[0].trim();        // 観察現象
    const autoMeaning = parts[1].trim();     // 自動的な意味づけ
    const premise = parts[2].trim();         // 前提
    const question = parts[3].trim();        // 問い直し
    const newMeaning = parts[4].trim();      // 新しい意味づけ

    // ② シートへ保存
    sheet.getRange(row, COL_DAY10_OBSERVED).setValue(observed);
    sheet.getRange(row, COL_DAY10_AUTO_MEANING).setValue(autoMeaning);
    sheet.getRange(row, COL_DAY10_PREMISE).setValue(premise);
    sheet.getRange(row, COL_DAY10_REQUESTION).setValue(question);
    sheet.getRange(row, COL_DAY10_NEW_MEANING).setValue(newMeaning);

    // ③ ユーザーへ返信
    replyToUser(userId, "Day10の回答を受け取りました。");

  } catch (e) {
    Logger.log("❌ Day10保存エラー: " + e);
    replyToUser(userId, "エラーが発生しました。もう一度送ってください。");
  }
}

/************************************************************
 * PART 15: Day11 保存処理（選択行動・判断基準・価値観・優先ポイント・再選択）
 ************************************************************/
function processDay11Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_(); // スプレッドシート取得
    const row = findUserRow(userId, sheet); // ユーザー行を取得
    if (!row) {
      logErr('processDay11', 'ユーザー行なし userId=' + userId);
      return;
    }

    // ---- 1. 回答テキストを Day11 用にパース ----
    // 期待形式：
    // #Day11
    // 選択行動: xxx
    // 明示理由: xxx
    // 暗黙価値: xxx
    // 優先ポイント: xxx
    // 再選択: xxx

    const parsed = parseDay11Format_(text);

    // ---- 2. スプレッドシートへ保存 ----
    // AN: 選択行動
    // AO: 明示理由
    // AP: 暗黙価値
    // AQ: 優先ポイント
    // AR: 再選択

    sheet.getRange(row, COL.Day11_selectedAction).setValue(parsed.selectedAction);
    sheet.getRange(row, COL.Day11_explicitReason).setValue(parsed.explicitReason);
    sheet.getRange(row, COL.Day11_implicitValue).setValue(parsed.implicitValue);
    sheet.getRange(row, COL.Day11_truePriority).setValue(parsed.truePriority);
    sheet.getRange(row, COL.Day11_reSelection).setValue(parsed.reSelection);

    // ---- 3. 完了メッセージ ----
    replyToUser(userId, "Day11 の回答を受け取りました。");

  } catch (e) {
    logErr('processDay11Answer', e);
  }
}

/************************************************************
 * Day11 回答パーサー（自由記述テキスト → 各項目に分解）
 ************************************************************/
function parseDay11Format_(text) {
  const obj = {
    selectedAction: "",
    explicitReason: "",
    implicitValue: "",
    truePriority: "",
    reSelection: ""
  };

  const lines = text.split(/\r?\n/).map(s => s.trim());

  lines.forEach(line => {
    if (/選択行動/i.test(line)) obj.selectedAction = line.replace(/選択行動[:：]/i, '').trim();
    if (/明示理由/i.test(line)) obj.explicitReason = line.replace(/明示理由[:：]/i, '').trim();
    if (/暗黙価値/i.test(line)) obj.implicitValue = line.replace(/暗黙価値[:：]/i, '').trim();
    if (/優先ポイント/i.test(line)) obj.truePriority = line.replace(/優先ポイント[:：]/i, '').trim();
    if (/再選択/i.test(line)) obj.reSelection = line.replace(/再選択[:：]/i, '').trim();
  });

  return obj;
}

/************************************************************
 * PART 16: Day12 保存処理（感情・文脈・意味・守りたい価値・ラベル）
 *  - 受信テキスト例：
 *    #Day12 感情:〇〇 文脈:△△ 意味:□□ 価値:☆☆ ラベル:★★
 ************************************************************/
function processDay12Answer(userId, text) {
  try {
    // ---------------------------------------------------------
    // ① テキストから「5つの要素」を抽出（Day12用）
    // ---------------------------------------------------------
    const emotionLabel     = extractNamedValue(text, '感情');
    const emotionContext   = extractNamedValue(text, '文脈');
    const emotionalMeaning = extractNamedValue(text, '意味');
    const protectedValue   = extractNamedValue(text, '価値');
    const emotionTagName   = extractNamedValue(text, 'ラベル');

    // ---------------------------------------------------------
    // ② スプレッドシートの行を探す
    // ---------------------------------------------------------
    const sheet = SpreadsheetApp.openById(PROP.SSID).getSheetByName(PROP.SHEET_NAME);
    const row   = findUserRow(sheet, userId);
    if (!row) {
      logErr('processDay12Answer', 'user row not found');
      return;
    }

    // ---------------------------------------------------------
    // ③ Day12 の各項目を保存
    //     ※COL_AS などは PART 0 の定数
    // ---------------------------------------------------------
    sheet.getRange(row, COL_AS).setValue(emotionLabel);
    sheet.getRange(row, COL_AT).setValue(emotionContext);
    sheet.getRange(row, COL_AU).setValue(emotionalMeaning);
    sheet.getRange(row, COL_AV).setValue(protectedValue);
    sheet.getRange(row, COL_AW).setValue(emotionTagName);

    // ---------------------------------------------------------
    // ④ ユーザーに返信
    // ---------------------------------------------------------
    const reply = 
      `Day12の回答を受け取りました。\n` +
      `感情: ${emotionLabel}\n` +
      `文脈: ${emotionContext}\n` +
      `保存が完了しました。`;

    linePushText(userId, reply);

  } catch (e) {
    logErr('processDay12Answer', e);
  }
}

/************************************************************
 * PART 17: Day13 保存処理（思考パターン・起点場面・意味づけ・強化経緯・現在の解釈）
 *   受信形式（例）：
 *   #Day13 パターン:〇〇 起点:△△ 意味:□□ 強化:☆☆ 現在:★★
 ************************************************************/
function processDay13Answer(userId, text) {
  try {
    // ① 必要5項目を抽出
    const pattern        = extractNamedValue(text, 'パターン');
    const originScene    = extractNamedValue(text, '起点');
    const originalMeaning = extractNamedValue(text, '意味');
    const reinforceFlow  = extractNamedValue(text, '強化');
    const currentInterpret = extractNamedValue(text, '現在');

    // ② 行取得
    const sheet = SpreadsheetApp.openById(PROP.SSID).getSheetByName(PROP.SHEET_NAME);
    const row   = findUserRow(sheet, userId);
    if (!row) {
      logErr('processDay13Answer', 'user row not found');
      return;
    }

    // ③ 保存（COL は PART 0 の定数）
    sheet.getRange(row, COL.DAY13_PATTERN).setValue(pattern);
    sheet.getRange(row, COL.DAY13_ORIGIN).setValue(originScene);
    sheet.getRange(row, COL.DAY13_ORIGINAL_MEAN).setValue(originalMeaning);
    sheet.getRange(row, COL.DAY13_REINFORCE).setValue(reinforceFlow);
    sheet.getRange(row, COL.DAY13_CURRENT).setValue(currentInterpret);

    // ④ 返信
    const reply =
      `Day13の回答を保存しました。\n` +
      `パターン: ${pattern}\n` +
      `起点: ${originScene}\n` +
      `保存が完了しました。`;

    linePushText(userId, reply);

  } catch (e) {
    logErr('processDay13Answer', e);
  }
}
/************************************************************
 * PART 18: Day14 保存処理（理想の構造）
 *  - 受信テキスト例：
 *    #Day14 理想:〇〇 行動:△△ 背景:□□ 感情:☆☆
 ************************************************************/
function processDay14Answer(userId, text) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    const row   = findUserRow(sheet, userId);
    if (!row) return;

    // ① パース処理
    // ------------------------------------------------------------
    const data = parseDay14Text_(text); // { ideal, action, background, emotion }

    // ② スプレッドシート保存
    // ------------------------------------------------------------
    // ※列番号はあなたのシート構成に合わせて修正済み
    sheet.getRange(row, COL_DAY14_IDEAL).setValue(data.ideal);
    sheet.getRange(row, COL_DAY14_ACTION).setValue(data.action);
    sheet.getRange(row, COL_DAY14_BACKGROUND).setValue(data.background);
    sheet.getRange(row, COL_DAY14_EMOTION).setValue(data.emotion);

    // ③ LINE返信
    // ------------------------------------------------------------
    replyToUser(userId, "Day14の回答を受け取りました。ありがとうございます。");

  } catch (e) {
    Logger.log("❌ processDay14Answer Error: " + e);
  }
}


/************************************************************
 * Day14 専用パーサー
 ************************************************************/
function parseDay14Text_(text) {
  // 例：#Day14 理想:〇〇 行動:△△ 背景:□□ 感情:☆☆

  const ideal      = extractAfterLabel_(text, "理想");
  const action     = extractAfterLabel_(text, "行動");
  const background = extractAfterLabel_(text, "背景");
  const emotion    = extractAfterLabel_(text, "感情");

  return {
    ideal:      ideal,
    action:     action,
    background: background,
    emotion:    emotion
  };
}
/************************************************************
 * PART 19: Day15 保存処理（行動の理由・欲求・根底ニーズ）
 ************************************************************/
function processDay15Answer(userId, text) {
  try {
    // ① ユーザー行取得
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    const userRow = findUserRow(sheet, userId);
    if (!userRow) {
      replyToUser(userId, "ユーザー情報が見つかりませんでした。");
      return;
    }

    // ② 内容抽出
    // 形式：#Day15 理由:〇〇 欲求:△△ ニーズ:□□
    const reason = extractAfter(text, "理由:");
    const desire = extractAfter(text, "欲求:");
    const need   = extractAfter(text, "ニーズ:");

    // ③ スプレッドシート列定義
    const COL_DAY15_REASON = 44; // 理由
    const COL_DAY15_DESIRE = 45; // 欲求
    const COL_DAY15_NEED   = 46; // 根底ニーズ

    // ④ シート書き込み
    sheet.getRange(userRow, COL_DAY15_REASON).setValue(reason);
    sheet.getRange(userRow, COL_DAY15_DESIRE).setValue(desire);
    sheet.getRange(userRow, COL_DAY15_NEED).setValue(need);

    // ⑤ LINE返信
    replyToUser(userId, "受け取りました");

  } catch (error) {
    Logger.log(`❌ Day15 エラー: ${error}`);
    replyToUser(userId, "エラーが発生しました。");
  }
}

/************************************************************
 * テキスト抽出の共通関数（再掲）
 ************************************************************/
function extractAfter(text, key) {
  if (!text || !key) return "";
  const idx = text.indexOf(key);
  if (idx === -1) return "";
  return text.substring(idx + key.length).split(" ")[0].trim();
}

/************************************************************
 * PART 20: Day16 保存処理（行動レシピの構造化）
 ************************************************************/
function processDay16Answer(userId, text) {
  try {
    const sheet = getUserSheet();
    const row   = findUserRow(sheet, userId);
    if (!row) {
      logErr("processDay16Answer", "user row not found");
      return;
    }

    // --------------------------------------------
    // ① テキスト解析（#Day16 … を除去して ｜ で分割）
    //  フォーマット:
    //   よかった体験｜行動の手順｜実行しやすい要因｜使いたい場面
    // --------------------------------------------
    const raw   = text.replace(/^#Day16\s*/i, "").trim();
    const parts = raw.split("｜");

    const goodExp   = parts[0] || "";
    const steps     = parts[1] || "";
    const factors   = parts[2] || "";
    const context   = parts[3] || "";

    // --------------------------------------------
    // ② 保存（COL は PART 0 の定数）
    // --------------------------------------------
    sheet.getRange(row, getColIndex(COL.DAY16_GOOD_EXP)).setValue(goodExp);
    sheet.getRange(row, getColIndex(COL.DAY16_STEPS)).setValue(steps);
    sheet.getRange(row, getColIndex(COL.DAY16_FACTORS)).setValue(factors);
    sheet.getRange(row, getColIndex(COL.DAY16_CONTEXT)).setValue(context);

    // --------------------------------------------
    // ③ 返信
    // --------------------------------------------
    const reply =
      "Day16 の記録を受け取りました📘\n" +
      "行動レシピが構造化されました。明日以降の再現性が高まります。";

    replyToUser(userId, reply);

  } catch (e) {
    logErr("processDay16Answer", e);
  }
}
/************************************************************
 * PART 21: Day17 保存処理（回答＋点数）
 ************************************************************/
function processDay17Answer(userId, userText) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    const answer = userText.replace(/^#?Day17/i, '').trim();
    if (!answer) return;

    // 採点
    const score = evaluateDay17Score_(answer);

    // 保存（BU：回答 / BT：点数）
    sheet.getRange(row, COL_MAP.Day17_回答).setValue(answer);
    sheet.getRange(row, COL_MAP.Day17_点数).setValue(score);

    replyToUser_(userId, "Day17の回答、受け取りました。");

  } catch (e) {
    Logger.log("❌ processDay17Answer Error: " + e);
  }
}
/************************************************************
 * PART 22: Day17 採点ロジック
 ************************************************************/
function evaluateDay17Score_(answer) {
  const len = answer.length;
  if (len >= 80) return 5;
  if (len >= 50) return 4;
  if (len >= 30) return 3;
  if (len >= 10) return 2;
  return 1;
}
/************************************************************
 * PART 23: Day18 保存処理（回答＋点数）
 *  - 受信例：#Day18 ○○○
 *  - 保存先：BU（回答） / BV（点数）
 ************************************************************/
function processDay18Answer(userId, userText) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // 回答抽出
    const answer = userText.replace(/^#?Day18/i, '').trim();
    if (!answer) return;

    // 点数（採点ロジックは別関数）
    const score = evaluateDay18Score_(answer);

    // 保存
    sheet.getRange(row, COL_MAP.Day18_回答).setValue(answer);
    sheet.getRange(row, COL_MAP.Day18_点数).setValue(score);

    // LINE返信
    replyToUser_(userId, "Day18の回答、受け取りました。");

  } catch (e) {
    Logger.log("❌ processDay18Answer Error: " + e);
  }
}

/************************************************************
 * PART 23-2: Day18 採点ロジック
 ************************************************************/
function evaluateDay18Score_(answer) {
  // 例：文字数でスコアリング（必要なら自由に変更OK）
  const len = answer.length;

  if (len >= 80) return 5;
  if (len >= 50) return 4;
  if (len >= 30) return 3;
  if (len >= 10) return 2;
  return 1;
}
/************************************************************
 * PART 23: Day18 保存処理（回答＋点数）
 *  - 受信例：#Day18 ○○○
 *  - 保存先：BU（回答） / BV（点数）
 ************************************************************/
function processDay18Answer(userId, userText) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // 回答抽出
    const answer = userText.replace(/^#?Day18/i, '').trim();
    if (!answer) return;

    // 採点
    const score = evaluateDay18Score_(answer);

    // 保存
    sheet.getRange(row, COL_MAP.Day18_回答).setValue(answer);
    sheet.getRange(row, COL_MAP.Day18_点数).setValue(score);

    // LINE返信
    replyToUser_(userId, "Day18の回答、受け取りました。");

  } catch (e) {
    Logger.log("❌ processDay18Answer Error: " + e);
  }
}


/************************************************************
 * PART 24: Day18 採点ロジック
 ************************************************************/
function evaluateDay18Score_(answer) {
  const len = answer.length;
  if (len >= 80) return 5;
  if (len >= 50) return 4;
  if (len >= 30) return 3;
  if (len >= 10) return 2;
  return 1;
}
/************************************************************
 * PART 25: Day19 保存処理（回答＋点数）
 *  - 受信例：#Day19 ○○○
 *  - 保存先：BW（回答） / BX（点数）
 ************************************************************/
function processDay19Answer(userId, userText) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // 回答抽出
    const answer = userText.replace(/^#?Day19/i, '').trim();
    if (!answer) return;

    // 採点
    const score = evaluateDay19Score_(answer);

    // 保存
    sheet.getRange(row, COL_MAP.Day19_回答).setValue(answer);
    sheet.getRange(row, COL_MAP.Day19_点数).setValue(score);

    // LINE返信
    replyToUser_(userId, "Day19の回答、受け取りました。");

  } catch (e) {
    Logger.log("❌ processDay19Answer Error: " + e);
  }
}


/************************************************************
 * PART 26: Day19 採点ロジック
 ************************************************************/
function evaluateDay19Score_(answer) {
  const len = answer.length;
  if (len >= 80) return 5;
  if (len >= 50) return 4;
  if (len >= 30) return 3;
  if (len >= 10) return 2;
  return 1;
}
/************************************************************
 * PART 27: Day20 保存処理（回答＋点数）
 *  - 受信例：#Day20 ○○○
 *  - 保存先：BY（回答） / BZ（点数）
 ************************************************************/
function processDay20Answer(userId, userText) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // 回答抽出
    const answer = userText.replace(/^#?Day20/i, '').trim();
    if (!answer) return;

    // 点数（採点ロジックは下部の関数）
    const score = evaluateDay20Score_(answer);

    // 保存（回答：BY / 点数：BZ）
    sheet.getRange(row, COL_MAP.Day20_回答).setValue(answer);
    sheet.getRange(row, COL_MAP.Day20_点数).setValue(score);

    // LINE返信（Day20はDay17〜20と同じ形式：受取＋点数）
    replyToUser_(userId, `Day20の回答を受け取りました。\n点数：${score} 点`);

  } catch (e) {
    Logger.log("❌ processDay20Answer Error: " + e);
  }
}
/************************************************************
 * PART 28: Day20 採点ロジック
 ************************************************************/
function evaluateDay20Score_(answer) {
  const len = answer.length;
  if (len >= 80) return 5;
  if (len >= 50) return 4;
  if (len >= 30) return 3;
  if (len >= 10) return 2;
  return 1;
}

/************************************************************
 * PART 29: Day21 保存処理（内的コンパス）
 ************************************************************/
function processDay21Answer(userId, text) {
  try {
    const sheet = getMainSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // フォーマット： #Day21 価値観｜場面｜理想｜問い｜コンパス
    const raw   = text.replace(/^#?Day21/i, "").trim();
    const parts = raw.split("｜");

    const coreValues       = parts[0] || "";
    const embodimentScene  = parts[1] || "";
    const idealStance      = parts[2] || "";
    const selfPrompt       = parts[3] || "";
    const actionCompass    = parts[4] || "";

    sheet.getRange(row, getColIndex("CA")).setValue(coreValues);
    sheet.getRange(row, getColIndex("CB")).setValue(embodimentScene);
    sheet.getRange(row, getColIndex("CC")).setValue(idealStance);
    sheet.getRange(row, getColIndex("CD")).setValue(selfPrompt);
    sheet.getRange(row, getColIndex("CE")).setValue(actionCompass);

    replyToUser_(userId, "Day21 の回答を受け取りました。");

  } catch (e) {
    logErr("processDay21Answer", e);
  }
}
/************************************************************
 * PART 30: Day22 保存処理（選択と責任）
 ************************************************************/
function processDay22Answer(userId, text) {
  try {
    const sheet = getMainSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // #Day22 選択場面｜理由｜選択？｜実際の選択肢｜新しい選択
    const raw   = text.replace(/^#?Day22/i, "").trim();
    const parts = raw.split("｜");

    const scene      = parts[0] || "";
    const avoided    = parts[1] || "";
    const ownership  = parts[2] || "";
    const options    = parts[3] || "";
    const newChoice  = parts[4] || "";

    sheet.getRange(row, getColIndex("CF")).setValue(scene);
    sheet.getRange(row, getColIndex("CG")).setValue(avoided);
    sheet.getRange(row, getColIndex("CH")).setValue(ownership);
    sheet.getRange(row, getColIndex("CI")).setValue(options);
    sheet.getRange(row, getColIndex("CJ")).setValue(newChoice);

    replyToUser_(userId, "Day22 の回答を受け取りました。");

  } catch (e) {
    logErr("processDay22Answer", e);
  }
}
/************************************************************
 * PART 31: Day23 保存処理（葛藤と統合）
 ************************************************************/
function processDay23Answer(userId, text) {
  try {
    const sheet = getMainSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // #Day23 テーマ｜声A｜声B｜願いA｜願いB｜両立案｜仮選択
    const raw   = text.replace(/^#?Day23/i, "").trim();
    const parts = raw.split("｜");

    const theme   = parts[0] || "";
    const voiceA  = parts[1] || "";
    const voiceB  = parts[2] || "";
    const wishA   = parts[3] || "";
    const wishB   = parts[4] || "";
    const options = parts[5] || "";
    const choice  = parts[6] || "";

    sheet.getRange(row, getColIndex("CK")).setValue(theme);
    sheet.getRange(row, getColIndex("CL")).setValue(voiceA);
    sheet.getRange(row, getColIndex("CM")).setValue(voiceB);
    sheet.getRange(row, getColIndex("CN")).setValue(wishA);
    sheet.getRange(row, getColIndex("CO")).setValue(wishB);
    sheet.getRange(row, getColIndex("CP")).setValue(options);
    sheet.getRange(row, getColIndex("CQ")).setValue(choice);

    replyToUser_(userId, "Day23 の回答を受け取りました。");

  } catch (e) {
    logErr("processDay23Answer", e);
  }
}
/************************************************************
 * PART 32: Day24 保存処理（姿勢の言語化）
 ************************************************************/
function processDay24Answer(userId, text) {
  try {
    const sheet = getMainSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // #Day24 行動対象｜姿勢｜理由｜一言
    const raw   = text.replace(/^#?Day24/i, "").trim();
    const parts = raw.split("｜");

    const target    = parts[0] || "";
    const stance    = parts[1] || "";
    const reason    = parts[2] || "";
    const phrase    = parts[3] || "";

    sheet.getRange(row, getColIndex("CR")).setValue(target);
    sheet.getRange(row, getColIndex("CS")).setValue(stance);
    sheet.getRange(row, getColIndex("CT")).setValue(reason);
    sheet.getRange(row, getColIndex("CU")).setValue(phrase);

    replyToUser_(userId, "Day24 の回答を受け取りました。");

  } catch (e) {
    logErr("processDay24Answer", e);
  }
}
/************************************************************
 * PART 33: Day25 保存処理（再接続フィードバック）
 *  - 受信例：
 *    #Day25 実施:○○ 印象:△△ 姿勢:□□ 気づき:☆☆ 再接続:★★
 ************************************************************/
function processDay25Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // -------------------------------
    // ① 要素抽出
    // -------------------------------
    const status    = extractNamedValue(text, '実施');      // 実施状況
    const impression = extractNamedValue(text, '印象');     // 行動中の印象・感情
    const stance     = extractNamedValue(text, '姿勢');     // 姿勢が保てたか
    const awareness  = extractNamedValue(text, '気づき');   // ズレ／一致の気づき
    const reconnect  = extractNamedValue(text, '再接続');   // 再接続のひとこと

    // -------------------------------
    // ② 保存
    // -------------------------------
    sheet.getRange(row, COL_MAP.Day25_実施状況).setValue(status);
    sheet.getRange(row, COL_MAP.Day25_印象).setValue(impression);
    sheet.getRange(row, COL_MAP.Day25_姿勢反省).setValue(stance);
    sheet.getRange(row, COL_MAP.Day25_気づき).setValue(awareness);
    sheet.getRange(row, COL_MAP.Day25_再接続).setValue(reconnect);

    // -------------------------------
    // ③ 返信
    // -------------------------------
    const reply =
      "Day25 の回答を受け取りました。\n" +
      "価値観と姿勢のふりかえり、保存完了です。";

    replyToUser_(userId, reply);

  } catch (e) {
    logErr("processDay25Answer", e);
  }
}
/************************************************************
 * PART 33: Day25 保存処理（再接続とフィードバック）
 ************************************************************/
function processDay25Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    // --- Day25：5項目抽出 --------------------
    const completed    = extractNamedValue(text, "実施状況");
    const impression   = extractNamedValue(text, "印象");
    const stanceKeep   = extractNamedValue(text, "姿勢");
    const awareness    = extractNamedValue(text, "気づき");
    const reconnectOne = extractNamedValue(text, "一言");

    // --- 保存（あなたの列構成に合わせる） ---
    sheet.getRange(row, COL_MAP.Day25_実施状況).setValue(completed);
    sheet.getRange(row, COL_MAP.Day25_印象).setValue(impression);
    sheet.getRange(row, COL_MAP.Day25_姿勢の継続).setValue(stanceKeep);
    sheet.getRange(row, COL_MAP.Day25_気づき).setValue(awareness);
    sheet.getRange(row, COL_MAP.Day25_再接続フレーズ).setValue(reconnectOne);

    replyToUser_(userId, "Day25の回答を記録しました。");
  } catch (e) {
    Logger.log("❌ processDay25Answer error: " + e);
  }
}
/************************************************************
 * PART 34: Day26 保存処理（他者への影響）
 ************************************************************/
function processDay26Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    const highlight   = extractNamedValue(text, "やり取り");
    const selfStance  = extractNamedValue(text, "姿勢");
    const impact      = extractNamedValue(text, "影響");
    const connection  = extractNamedValue(text, "つながり");
    const nextIntent  = extractNamedValue(text, "次");

    sheet.getRange(row, COL_MAP.Day26_やり取り).setValue(highlight);
    sheet.getRange(row, COL_MAP.Day26_姿勢).setValue(selfStance);
    sheet.getRange(row, COL_MAP.Day26_影響).setValue(impact);
    sheet.getRange(row, COL_MAP.Day26_つながり).setValue(connection);
    sheet.getRange(row, COL_MAP.Day26_次の意図).setValue(nextIntent);

    replyToUser_(userId, "Day26の回答を記録しました。");
  } catch (e) {
    Logger.log("❌ processDay26Answer error: " + e);
  }
}
/************************************************************
 * PART 35: Day27 保存処理（選択パターンの再設計）
 ************************************************************/
function processDay27Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    const pattern   = extractNamedValue(text, "パターン");
    const trigger   = extractNamedValue(text, "きっかけ");
    const chain     = extractNamedValue(text, "連鎖");
    const alternate = extractNamedValue(text, "代替");
    const redesign  = extractNamedValue(text, "一手");

    sheet.getRange(row, COL_MAP.Day27_パターン).setValue(pattern);
    sheet.getRange(row, COL_MAP.Day27_きっかけ).setValue(trigger);
    sheet.getRange(row, COL_MAP.Day27_連鎖).setValue(chain);
    sheet.getRange(row, COL_MAP.Day27_代替案).setValue(alternate);
    sheet.getRange(row, COL_MAP.Day27_再設計).setValue(redesign);

    replyToUser_(userId, "Day27の回答を記録しました。");
  } catch (e) {
    Logger.log("❌ processDay27Answer error: " + e);
  }
}
/************************************************************
 * PART 36: Day28 保存処理（セルフトークの再定義）
 ************************************************************/
function processDay28Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    const phrase     = extractNamedValue(text, "セルフトーク");
    const context    = extractNamedValue(text, "場面");
    const influence  = extractNamedValue(text, "影響");
    const redefine   = extractNamedValue(text, "言い換え");
    const preferred  = extractNamedValue(text, "使いたい言葉");

    sheet.getRange(row, COL_MAP.Day28_セルフトーク).setValue(phrase);
    sheet.getRange(row, COL_MAP.Day28_場面).setValue(context);
    sheet.getRange(row, COL_MAP.Day28_影響).setValue(influence);
    sheet.getRange(row, COL_MAP.Day28_言い換え).setValue(redefine);
    sheet.getRange(row, COL_MAP.Day28_使いたい言葉).setValue(preferred);

    replyToUser_(userId, "Day28の回答を記録しました。");
  } catch (e) {
    Logger.log("❌ processDay28Answer error: " + e);
  }
}
/************************************************************
 * PART 37: Day29 保存処理（選択のルール）
 ************************************************************/
function processDay29Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    const scene   = extractNamedValue(text, "場面");
    const criteria= extractNamedValue(text, "基準");
    const origin  = extractNamedValue(text, "起源");
    const evalNow = extractNamedValue(text, "今の評価");
    const axis    = extractNamedValue(text, "選択軸");

    sheet.getRange(row, COL_MAP.Day29_場面).setValue(scene);
    sheet.getRange(row, COL_MAP.Day29_基準).setValue(criteria);
    sheet.getRange(row, COL_MAP.Day29_起源).setValue(origin);
    sheet.getRange(row, COL_MAP.Day29_評価).setValue(evalNow);
    sheet.getRange(row, COL_MAP.Day29_選択軸).setValue(axis);

    replyToUser_(userId, "Day29の回答を記録しました。");
  } catch (e) {
    Logger.log("❌ processDay29Answer error: " + e);
  }
}
/************************************************************
 * PART 38: Day30 保存処理（差分と現在地）
 ************************************************************/
function processDay30Answer(userId, text) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) return;

    const initObs   = extractNamedValue(text, "初期現象");
    const change    = extractNamedValue(text, "変化");
    const memorable = extractNamedValue(text, "印象的なDay");
    const nowSelf   = extractNamedValue(text, "今の自分");
    const title     = extractNamedValue(text, "タイトル");

    sheet.getRange(row, COL_MAP.Day30_初期現象).setValue(initObs);
    sheet.getRange(row, COL_MAP.Day30_変化).setValue(change);
    sheet.getRange(row, COL_MAP.Day30_印象的).setValue(memorable);
    sheet.getRange(row, COL_MAP.Day30_現在の自分).setValue(nowSelf);
    sheet.getRange(row, COL_MAP.Day30_タイトル).setValue(title);

    replyToUser_(userId, "Day30の回答を記録しました。");
  } catch (e) {
    Logger.log("❌ processDay30Answer error: " + e);
  }
}
/************************************************************
 * PART 39: Day25〜30 のルーティング処理
 *  受信した LINE メッセージから Day を判定して
 *  各 Day の保存処理へ振り分ける
 ************************************************************/
function routeDay25to30_(userId, text) {

  // 空白除去
  const t = text.trim();

  // Day25
  if (/^#?Day25/i.test(t)) {
    processDay25Answer(userId, t);
    return true;
  }

  // Day26
  if (/^#?Day26/i.test(t)) {
    processDay26Answer(userId, t);
    return true;
  }

  // Day27
  if (/^#?Day27/i.test(t)) {
    processDay27Answer(userId, t);
    return true;
  }

  // Day28
  if (/^#?Day28/i.test(t)) {
    processDay28Answer(userId, t);
    return true;
  }

  // Day29
  if (/^#?Day29/i.test(t)) {
    processDay29Answer(userId, t);
    return true;
  }

  // Day30
  if (/^#?Day30/i.test(t)) {
    processDay30Answer(userId, t);
    return true;
  }

  return false; // いずれでもない
}
/************************************************************
 * PART 40: Day25〜30 ルーティング（完成版）
 ************************************************************/
function routeDay25to30_(userId, text) {
  try {
    if (!userId || !text) return false;

    // 全角→半角整形・空白除去
    const t = String(text).replace(/\u3000/g, " ").trim();

    // -------------------------
    // Day25
    // -------------------------
    if (/^#?Day25\b/i.test(t)) {
      if (typeof processDay25Answer === "function") {
        processDay25Answer(userId, t);
      }
      return true;
    }

    // -------------------------
    // Day26
    // -------------------------
    if (/^#?Day26\b/i.test(t)) {
      if (typeof processDay26Answer === "function") {
        processDay26Answer(userId, t);
      }
      return true;
    }

    // -------------------------
    // Day27
    // -------------------------
    if (/^#?Day27\b/i.test(t)) {
      if (typeof processDay27Answer === "function") {
        processDay27Answer(userId, t);
      }
      return true;
    }

    // -------------------------
    // Day28
    // -------------------------
    if (/^#?Day28\b/i.test(t)) {
      if (typeof processDay28Answer === "function") {
        processDay28Answer(userId, t);
      }
      return true;
    }

    // -------------------------
    // Day29
    // -------------------------
    if (/^#?Day29\b/i.test(t)) {
      if (typeof processDay29Answer === "function") {
        processDay29Answer(userId, t);
      }
      return true;
    }

    // -------------------------
    // Day30
    // -------------------------
    if (/^#?Day30\b/i.test(t)) {
      if (typeof processDay30Answer === "function") {
        processDay30Answer(userId, t);
      }
      return true;
    }

    // -------------------------
    // どれでもない
    // -------------------------
    return false;

  } catch (err) {
    logErr("routeDay25to30_", err);
    return false;
  }
}


/************************************************************
 * 70. generateOsPatternPrompt
 * Day17〜29 + 個人属性（MBTI/出生年/職業）から
 * OSパターン名称・説明を生成するGPTプロンプトを構築
 ************************************************************/
function generateOsPatternPrompt(userData) {
  return `
あなたは「認知OS分析（Noubito）」の専門家です。

### 【目的】
ユーザーの思考・反応・行動のパターンを、
MBTIや既存の分類ではなく、
本人の思考OSを表す「OSパターン」として命名し、
説明文を作成してください。

### 【OSパターンの定義】
- INTP/ENFPなどのMBTI名称は禁止
- 無料診断のテンプレ禁止
- “構造先行型”“整合性駆動”など OSの動き方を表す命名にする
- 一般名詞＋OS特性で構成する（例：構造先行型、意味探索型、未来投影OSなど）

### 【ユーザー情報】
MBTI：${userData.mbti || "未入力"}
出生年：${userData.birthYear || "未入力"}
職業：${userData.occupation || "未入力"}

### 【Day17〜29のデータ】
${JSON.stringify(userData.dayData, null, 2)}

### 【出力仕様】
以下のJSON形式で返してください：

{
  "osPatternName": "（タイプ名・短い）",
  "osPatternDescription": "（OSの動作原理・思考傾向・反応特性を200〜300文字で説明）"
}

日本語で書くこと。
    `;
}
/************************************************************
 * 71. fetchOsPatternFromGPT
 * OSパターン名＋OSパターン説明をGPTから取得
 ************************************************************/
function fetchOsPatternFromGPT(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  const url = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a cognitive OS analyst." },
      { role: "user", content: prompt }
    ],
    temperature: 0.6,
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  const content = json.choices?.[0]?.message?.content || "";

  return content;
}
/************************************************************
 * 72. parseOsPatternJson
 * GPTが返した文字列から JSON を抽出して返す
 ************************************************************/
function parseOsPatternJson(gptText) {
  try {
    const match = gptText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSONが見つかりません");
    return JSON.parse(match[0]);
  } catch (e) {
    Logger.log("❌ OSパターン JSON抽出エラー: " + e);
    return {
      osPatternName: "構造パターン",
      osPatternDescription: "OSパターンの抽出に失敗したため、デフォルト値を返します。"
    };
  }
}
/************************************************************
 * 73. buildOsPatternForDay30
 * Day30レポート用の OSパターン（名称＋説明）を一括生成
 ************************************************************/
function buildOsPatternForDay30(userData) {

  // 1. プロンプト構築
  const prompt = generateOsPatternPrompt(userData);

  // 2. GPT呼び出し
  const gptResponse = fetchOsPatternFromGPT(prompt);

  // 3. JSON抽出
  const parsed = parseOsPatternJson(gptResponse);

  return {
    osPatternName: parsed.osPatternName,
    osPatternDescription: parsed.osPatternDescription
  };
}
/************************************************************
 * 74. generateDay30HtmlReport
 * Day30レポートHTML（最終完全版）を生成する
 ************************************************************/
function generateDay30HtmlReport(reportData) {

  // HTMLテンプレート読み込み
  const templateFile = HtmlService.createTemplateFromFile('template_day30');

  // ============ 1. 必須セクションを差し込み ============
  templateFile.title                = reportData.title || "Noubito Day30 レポート";
  templateFile.typeName             = reportData.typeName || "";
  templateFile.typeDescription      = reportData.typeDescription || "";

  templateFile.scoreSection         = reportData.scoreSection || "";
  templateFile.dominantLayer        = reportData.dominantLayer || "";
  templateFile.thinkingType         = reportData.thinkingType || "";

  templateFile.conflictSection      = reportData.conflictSection || "";
  templateFile.shiftSection         = reportData.shiftSection || "";
  templateFile.valueFormingBackground = reportData.valueFormingBackground || "";
  templateFile.finalTips            = reportData.finalTips || "";

  // ============ 2. OSパターン（新規追加） ============
  templateFile.osPatternName        = reportData.osPatternName || "";
  templateFile.osPatternDescription = reportData.osPatternDescription || "";

  // ============ 3. 図表（Base64） ============
  templateFile.viewpointChartBase64 = reportData.viewpointChartBase64 || "";

  // ============ 4. Preface / Outro ============
  templateFile.prefaceHtml          = reportData.prefaceHtml || "";
  templateFile.outroHtml            = reportData.outroHtml || "";

  // ============ 5. Day24〜29 カードHTML ============
  templateFile.cardsHtml            = reportData.cardsHtml || "";

  // ============ 6. 最終的なHTML文字列にする ============
  const html = templateFile.evaluate().getContent();
  return html;
}
function processDay30SummaryAnalysis(userId) {
  const reportData = {
    title: "",
    typeName: "",
    typeDescription: "",
    scoreSection: "",
    dominantLayer: "",
    thinkingType: "",
    conflictSection: "",
    shiftSection: "",
    valueFormingBackground: "",
    finalTips: "",
    osPatternName: "",
    osPatternDescription: "",
    viewpointChartBase64: "",
    cardsHtml: "",
    prefaceHtml: "",
    outroHtml: ""
  };

  // （このあと reportData.xxx に値を入れていく）
}

/************************************************************
 * 25. createDay30PdfFromHtml
 * HTML → PDF（スマホ縦長対応）を生成し、Driveに保存
 * 戻り値：{ fileId, pdfBytes }
 ************************************************************/
function createDay30PdfFromHtml(htmlContent, userId) {

  // 一時HTMLファイル作成
  const tempHtml = HtmlService.createHtmlOutput(htmlContent)
    .setTitle("Day30 Report")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);

  const blob = tempHtml.getBlob().setName("day30_temp.html");

  // HTML → PDF 変換（puppeteer相当の内部GAS機能）
  const pdfBlob = blob.getAs('application/pdf').setName("Day30_Report.pdf");

  // ユーザー別フォルダに保存
  const folder = getOrCreateDay30Folder(userId);
  const file = folder.createFile(pdfBlob);

  return {
    fileId: file.getId(),
    pdfBytes: pdfBlob.getBytes()
  };
}

/************************************************************
 * Day30用フォルダ取得（なければ作る）
 ************************************************************/
function getOrCreateDay30Folder(userId) {

  const parentFolderId = PropertiesService.getScriptProperties()
    .getProperty('DAY30_FOLDER_ROOT');

  if (!parentFolderId) {
    throw new Error("DAY30_FOLDER_ROOT が設定されていません");
  }

  const parent = DriveApp.getFolderById(parentFolderId);

  // 既存フォルダ探す
  const it = parent.getFoldersByName(userId);
  if (it.hasNext()) return it.next();

  // なければ生成
  return parent.createFolder(userId);
}
/************************************************************
 * 26. sendDay30ReportPdf
 * LINEへPDFを送信（バイナリ送信 完全版）
 ************************************************************/
function sendDay30ReportPdf(userId, pdfBytes, fileName) {

  const token = PropertiesService.getScriptProperties()
    .getProperty("LINE_CHANNEL_TOKEN");

  const url = "https://api.line.me/v2/bot/message/push";

  const boundary = "LINE-PDF-BOUNDARY";
  const data = Utilities.newBlob("", "multipart/form-data", "");

  let body = "";
  body += "--" + boundary + "\r\n";
  body += "Content-Disposition: form-data; name=\"to\"\r\n\r\n";
  body += userId + "\r\n";

  body += "--" + boundary + "\r\n";
  body += "Content-Disposition: form-data; name=\"messages\"; filename=\"payload.json\"\r\n";
  body += "Content-Type: application/json\r\n\r\n";

  const messageJson = JSON.stringify({
    to: userId,
    messages: [
      {
        type: "file",
        fileName: fileName || "Day30_Report.pdf",
        fileSize: pdfBytes.length
      }
    ]
  });

  body += messageJson + "\r\n";

  body += "--" + boundary + "\r\n";
  body += "Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n";
  body += "Content-Type: application/pdf\r\n\r\n";

  const payloadBlob = Utilities.newBlob(
    body,
    "multipart/form-data; boundary=" + boundary
  );

  const pdfBlob = Utilities.newBlob(pdfBytes, "application/pdf", fileName);

  const fullPayload = Utilities.newBlob(
    payloadBlob.getBytes()
      .concat(pdfBlob.getBytes())
      .concat(Utilities.newBlob("\r\n--" + boundary + "--", "text/plain").getBytes())
  );

  const params = {
    method: "post",
    headers: { "Authorization": "Bearer " + token },
    payload: fullPayload,
    contentType: "multipart/form-data; boundary=" + boundary,
    muteHttpExceptions: true,
  };

  const res = UrlFetchApp.fetch(url, params);
  Logger.log("LINE送信結果: " + res.getContentText());

  return res.getResponseCode();
}
/************************************************************
 * 31. processDay30SummaryAnalysis（完成版）
 *  Day24〜30 の全データを収集し、
 *  OSパターン生成プロンプトを作成 → GPT解析
 *  → HTML生成 → PDF生成 → LINE送信まで一括実行
 ************************************************************/
function processDay30SummaryAnalysis(userId) {
  try {
    const sheet = getNoubitoSheet_();
    const row   = findUserRow_(sheet, userId);
    if (!row) {
      replyToUser_(userId, "ユーザー情報が見つかりません。");
      return;
    }

    //----------------------------------------------------
    // ① Day24〜29 の回答をすべて取得
    //----------------------------------------------------
    const dayData = getDay24to29Data_(sheet, row);   // 関数56
    const day30   = getDay30Answer_(sheet, row);     // 関数57

    //----------------------------------------------------
    // ② 個人情報（MBTI・出生年など）取得
    //----------------------------------------------------
    const personal = getDay30PersonalInfo_(sheet, row); // MBTI, birthYear, occupation…
    const valueFormingYear = personal.birthYear
      ? Number(personal.birthYear) + 14
      : "";

    //----------------------------------------------------
    // ③ GPTプロンプトを生成（OSパターン対応版）
    //----------------------------------------------------
    const prompt = generateOsPatternPrompt_({
      day24to29: dayData,
      day30: day30,
      initialObservation: day30.initialObservation || "",
      valueFormingYear: valueFormingYear,
      userPersonalInfo: personal
    });

    //----------------------------------------------------
    // ④ GPTへ送信 → OSパターン解析を取得
    //----------------------------------------------------
    const gptResponse = callChatGPTFromOpenAI(prompt, {
      response_format: { type: "json_object" }
    });

    //----------------------------------------------------
    // ⑤ JSON抽出（安全なパーサー）
    //----------------------------------------------------
    const parsed = safeParseJson_(gptResponse);
    if (!parsed) {
      replyToUser_(userId, "Day30の解析に失敗しました。再度お試しください。");
      return;
    }

    //----------------------------------------------------
    // ⑥ HTML生成（OSパターンを差し込む）
    //----------------------------------------------------
    const html = generateDay30HtmlReport_({
      userId: userId,
      osPatternName: parsed.osPatternName,
      osPatternDescription: parsed.osPatternDescription,
      factor1: parsed.factor1,
      factor2: parsed.factor2,
      factor3: parsed.factor3,
      factor4: parsed.factor4,
      factor5: parsed.factor5,
      day24to29: dayData,
      day30: day30,
      personal: personal,
      valueFormingYear: valueFormingYear
    });

    //----------------------------------------------------
    // ⑦ PDF生成
    //----------------------------------------------------
    const pdfBlob = createDay30PdfFromHtml_(html);

    //----------------------------------------------------
    // ⑧ LINEへPDF送信
    //----------------------------------------------------
    sendDay30ReportPdf_(userId, pdfBlob);

    //----------------------------------------------------
    // ⑨ 完了メッセージ
    //----------------------------------------------------
    replyToUser_(userId, "Day30診断レポートの生成が完了しました。📘");

  } catch (e) {
    Logger.log("❌ processDay30SummaryAnalysis Error: " + e);
    replyToUser_(userId, "Day30レポート生成中にエラーが発生しました。");
  }
}

/************************************************************
 * 55. generateOsPatternPrompt_（Day30 OSパターン解析プロンプト生成）
 *  - Day24〜29の構造データ
 *  - Day30（差分と現在地）
 *  - 初期現象（Day1〜3のログがあれば）
 *  - 個人情報（MBTI／出生年／14歳時の背景）
 *  を統合して GPT に渡すプロンプトを生成する
 ************************************************************/
function generateOsPatternPrompt_(payload) {

  const { day24to29, day30, initialObservation,
          valueFormingYear, userPersonalInfo } = payload;

  const mbti    = userPersonalInfo?.mbti || "";
  const birth   = userPersonalInfo?.birthYear || "";
  const job     = userPersonalInfo?.occupation || "";

  return `
あなたは「認知OSの構造解析エンジン」です。
以下の30日間データから、ユーザーの思考OSパターンを構造的に抽出してください。

【出力形式（必ずJSON）】
{
  "osPatternName": "",
  "osPatternDescription": "",

  "factor1": "",
  "factor2": "",
  "factor3": "",
  "factor4": "",
  "factor5": ""
}

【OSパターン名の要件】
- MBTI名や16タイプの名前は禁止
- 無料診断のような表現は禁止
- 以下のような概念名にする：
  - 構造先行型（Structure-First）
  - 意味探索型（Meaning-Seeker）
  - 予測回路優位（Future-Projection）
  - 整合性駆動（Consistency-Driven）
  - 感覚帰着型（Sensory-Grounded）
- Noubitoの理念（“壁を薄くする”）からズレない抽象度

【OSパターンの説明文】
- 「特性の長所／短所」ではなく OS構造として記述
- “どう反応が生成されているか”にフォーカスする
- 行動・反応・視点の連鎖を中心に説明する

【5分類の定義】
1. 資質構造：  
   - どんなOS配線で思考が生成されているか
   - Day24〜29の傾向を中心にモデル化

2. 内的矛盾とズレ：  
   - 理想文（Day14〜17）とDay24〜29の行動／視点のズレ構造
   - Noubitoの「差分可視化」原則に基づく

3. 変化と起源：  
   - Day30の“初期現象→変化”から因果連鎖を抽出
   - valueFormingYear（出生＋14）も分析に使用

4. 自己認識：  
   - メタ認知の癖、見落としやすい盲点
   - 反応のクセ・重力圏（dominantLayer）

5. 留意点：  
   - 注意点ではなく「壁を薄くするための小さな最適化」
   - 行動指示を出さない。OS調整ポイントを書く。

-----------------------------------------
【入力データ】
■ Day24〜29（構造領域）
${JSON.stringify(day24to29, null, 2)}

■ Day30（差分と現在地）
${JSON.stringify(day30, null, 2)}

■ 初期現象
${initialObservation}

■ MBTI（任意）
${mbti}

■ 出生年
${birth}

■ 価値観形成期（出生＋14）
${valueFormingYear}

■ 職業
${job}
-----------------------------------------

上記すべてを元に、必ず「JSONのみ」で出力してください。
`;
}



