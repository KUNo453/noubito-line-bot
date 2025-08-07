// ===============================
// 1．Webhook受信（即時レスポンス版）
// ===============================
function doPost(e) {
  try {
    // 即時レスポンスでLINEエラーを防止
    const response = ContentService.createTextOutput("OK");

    // 本処理は非同期で分離
    handleLineEventAsync(e);
    return response;
  } catch (error) {
    Logger.log("❌ doPost error: " + error.toString());
    return ContentService.createTextOutput("Error");
  }
}
// ===============================
// 1-A．handleLineEventAsync（Day17〜30の回答処理分岐）
// ===============================
function handleLineEventAsync(e) {
  const message = getMessageTextFromEvent(e);

  // Day17〜23（Day21のみGPT採点）
  if (
    message.startsWith("#Day17") ||
    message.startsWith("#Day18") ||
    message.startsWith("#Day19") ||
    message.startsWith("#Day20") ||
    message.startsWith("#Day21") ||
    message.startsWith("#Day22") ||
    message.startsWith("#Day23")
  ) {
    processDay17to23Answer(e); // ← 関数13-A：GPTあり／なし判定付き採点処理
    return;
  }

  // Day24〜29（すべてGPT採点）
  const dayMatch = message.match(/^#Day(\d{2})/);
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10);
    if (day >= 24 && day <= 29) {
      processDayAnswer(day, e); // ← 関数15：GPTスコア＋コメント
      return;
    }
  }

  // Day30以降やその他の処理が必要な場合はここに追加
}

// ===============================
// 2．Webhook本体処理（非同期）
// ===============================
function handleLineEventAsync(e) {
  if (!e || !e.postData || !e.postData.contents) return;

  const json = JSON.parse(e.postData.contents);
  const events = json.events;
  if (!Array.isArray(events) || events.length === 0) return;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const userId = event?.source?.userId || null;
    if (!userId) continue;
    const text = event.message?.text?.trim();
    if (!text) continue;

    // ✅ スタート登録（先返信・後登録）
    if (event.type === 'message' && text === 'スタート') {
      sendTextMessage(userId, `登録が完了しました🌿\n明日から毎朝6:00にメッセージをお届けします🕊`);
      try {
        const profile = UrlFetchApp.fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          method: 'get',
          headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN }
        });
        const displayName = JSON.parse(profile.getContentText()).displayName;
        registerUserIfNotExists(userId, displayName);
      } catch (e) {
        Logger.log("❌ プロフィール取得失敗: " + e.toString());
        registerUserIfNotExists(userId);  // fallback
      }
      continue;
    }

    // ✅ Day17〜23（Day21のみGPT）
    if (/^#Day(1[7-9]|2[0-3])/i.test(text)) {
      processDay17to23Answer(e); // 関数13-A
      continue;
    }

    // ✅ Day24〜29（回答保存処理）
    if (/^#Day24/i.test(text)) {
      processDay24Answer(event, userId, text); // 関数20
      continue;
    }
    if (/^#Day25/i.test(text)) {
      processDay25Answer(userId, text); // 関数21
      continue;
    }
    if (/^#Day26/i.test(text)) {
      processDay26Answer(userId, text); // 関数22
      continue;
    }
    if (/^#Day27/i.test(text)) {
      processDay27Answer(userId, text); // 関数23
      continue;
    }
    if (/^#Day28/i.test(text)) {
      processDay28Answer(userId, text); // 関数24
      continue;
    }
    if (/^#Day29/i.test(text)) {
      processDay29Answer(userId, text); // 関数25
      continue;
    }

    // ✅ ハッシュタグ自由記述系（Day13夜など）
    if (text.includes('#')) {
      handleHashtagInput(userId, text);
      continue;
    }

    // ✅ MBTI入力処理
    if (isMbtiType(text)) {
      saveMbtiType(userId, text.toUpperCase());
      sendTextMessage(userId, `🧠 MBTIタイプ「${text.toUpperCase()}」を受け取りました！`);
      continue;
    }
  }
}

// ===============================
// ３．MBTI判定（INFPなど）
// ===============================
function isMbtiType(text) {
  const mbtiTypes = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
                     "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"];
  return mbtiTypes.includes(text.trim().toUpperCase());
}

// ===============================
// 4．MBTIタイプ判定・保存
// ===============================
function isMbtiType(text) {
  const mbtiTypes = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
                     "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"];
  return mbtiTypes.includes(text.trim().toUpperCase());
}

function saveMbtiType(userId, mbti) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      sheet.getRange(i + 1, 6).setValue(mbti);
      break;
    }
  }
}

// ===============================
// 5．LINEテキスト返信（共通）
// ===============================
function sendTextMessage(userId, text) {
  const payload = {
    to: userId,
    messages: [{ type: "text", text: text }]
  };

  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", options);
  const code = response.getResponseCode();

  if (code !== 200) {
    Logger.log("❌ LINEメッセージ送信失敗: " + code + " - " + response.getContentText());
  } else {
    Logger.log("✅ LINEメッセージ送信成功: " + code);
  }
}

// ===============================
// ６．#ネガティブなどのハッシュタグ記録
// ===============================
function handleHashtagInput(userId, text) {
  const hashtagColumnMap = {
    "#ネガティブ": 7
  };

  const matched = Object.keys(hashtagColumnMap).find(tag => text.startsWith(tag));
  if (!matched) return;

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === userId);
  if (rowIndex === -1) return;

  const value = text.replace(matched, "").trim();
  const colIndex = hashtagColumnMap[matched];
  if (value !== "") {
    sheet.getRange(rowIndex + 1, colIndex).setValue(value);
    Logger.log(`📌 ${matched} → ${value} を ${colIndex}列に記録しました`);
  }
}
// ===============================
// 7．スプレッドシートに登録（重複チェック・初期値Day=0）
// ===============================
function registerUserIfNotExists(userId) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const now = new Date();

    const profileUrl = `https://api.line.me/v2/bot/profile/${userId}`;
    const response = UrlFetchApp.fetch(profileUrl, {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
      }
    });
    const profile = JSON.parse(response.getContentText());
    const displayName = profile.displayName || "";

    const existingIndex = data.findIndex(row => row[0] === userId);
    if (existingIndex !== -1) {
      // ✅ 既存ユーザー → 名前・状態の更新、Day数はリセット
      sheet.getRange(existingIndex + 1, 2).setValue(displayName); // B列：名前
      sheet.getRange(existingIndex + 1, 4).setValue("active");    // D列：状態
      sheet.getRange(existingIndex + 1, 5).setValue(0);           // E列：Day数
      return;
    }

    // ✅ 新規ユーザー登録（A〜E列のみ初期化。残り列は空のまま）
    sheet.appendRow([
      userId,         // A列：userId
      displayName,    // B列：名前
      now,            // C列：登録日
      "active",       // D列：状態
      0               // E列：Day数（初期値）
      // F列以降は空欄として省略（自動で空になる）
    ]);
  } catch (e) {
    Logger.log("❌ registerUserIfNotExists エラー: " + e.toString());
  }
}

// ===============================
// 8．Flex Messageによるスタートメッセージ送信
// ===============================
function sendStartFlexMessage(userId) {
  const displayName = getDisplayName(userId) || "ご登録者";

  const flexMessage = {
    to: userId,
    messages: [
      {
        type: "flex",
        altText: `${displayName}さん、ご登録ありがとうございます🌱`,
        contents: {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://drive.google.com/uc?export=view&id=1X3vYm8gvJfKIxJ5gQ9VW740OeXEuHllt",
            size: "full",
            aspectRatio: "3:4",
            aspectMode: "cover"
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "🌱 スタートありがとうございます。",
                weight: "bold",
                wrap: true,
                size: "md"
              },
              {
                type: "text",
                text:
                  "植物と天気を通じて、心と脳を整える”読む瞑想”を毎朝そっとお届けしていきます🍀。どうぞお楽しみに！",
                wrap: true,
                size: "sm",
                margin: "md"
              }
            ]
          }
        }
      }
    ]
  };

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(flexMessage),
    muteHttpExceptions: true  // ✅ 念のためレスポンス取得可能に
  });
}

// ===============================
//9．天気情報の取得
// ===============================
function getWeather() {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${CITY_NAME}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=ja`;
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    Logger.log("📝 天気の説明: " + (data.weather?.[0]?.description || "情報なし"));
    return {
      description: data.weather?.[0]?.description || "天気情報なし",
      temp: data.main?.temp ?? null,
      humidity: data.main?.humidity ?? null
    };
  } catch (e) {
    Logger.log("❌ 天気取得エラー: " + e);
    return {
      description: "天気取得失敗",
      temp: null,
      humidity: null
    };
  }
}

// ===============================
// 10．Day別 朝メッセージ用プロンプト生成（Day=0〜対応）
// ===============================
function generatePromptFromWeatherAndDay(weather, day) {
  const tempText = (typeof weather.temp === 'number')
    ? `${weather.temp.toFixed(1)}℃`
    : "不明";

  const humidityText = (typeof weather.humidity === 'number')
    ? `${weather.humidity}%`
    : "不明";

  const description = weather.description || "天気不明";
  const numericDay = (!isNaN(Number(day))) ? Number(day) : 0;

  // Day10〜16：脳トレ導入フェーズ（サトリ文体＋トレーニング指示）
  if (numericDay >= 10 && numericDay <= 16) {
    const dayThemes = {
      10: { title: "選べる自分になる", training: "【1】5秒我慢法", focus: "衝動抑制・自己制御" },
      11: { title: "一音に集中してみる", training: "【2】RAS強化ワーク", focus: "注意制御・選択的集中" },
      12: { title: "自分を実況してみる", training: "【3】実況中継ワーク", focus: "メタ認知・感情観察" },
      13: { title: "逆さことばで脳を遊ばせる", training: "【4】逆復唱ワーク", focus: "ワーキングメモリ・処理速度" },
      14: { title: "反応から“選択”へ", training: "5秒我慢・再応用", focus: "意思決定・判断力" },
      15: { title: "ノイズを選ぶ", training: "RAS強化ワーク再応用", focus: "感覚選択・フィルター力" },
      16: { title: "思考を実況する力", training: "実況中継ワーク応用", focus: "自己認識・論理展開力" },
    };

    const { title, training, focus } = dayThemes[numericDay];

    return `
あなたは「慧理（さとり）」という、都市で観葉植物と静かに暮らす26歳の男性です。
Day${numericDay}では、心と脳を整える習慣（脳トレ）を日々の語りの中にやさしく織り込んでください。

【語りの文体ルール】
- 一人称は「私」。丁寧でやさしい「ですます調」。
- 湊かなえ風の静けさ、スナフキン的距離感、日記風の語り口。
- 文末は断定しすぎず、「〜かもしれません」「〜だったりして」など余白を残してください。
- 読者への問いかけと、送り出しの言葉を必ず含めてください。
- 文全体は150〜280文字、5〜8文で。
- 絵文字は🌿☁️🧠などを1〜3個、文脈に自然に溶け込ませてください。

【🧠 トレーニング部分のルール】
- トレーニング名と実践方法を明記してください（例：「5秒我慢法」）。
- トレーニングの目的や効果の説明は**断定口調で構いません**（例：「衝動をコントロールする力が育ちます」）。
- ただし全体の語りの雰囲気を壊さないよう、あくまで日記内で自然に触れてください。

【出力内容】
1. 「おはようございます。」で始めてください。
2. 「今日の天気」「植物の様子」は必ず含めてください。
3. トレーニング紹介（1つ）を自然に挿入してください。
4. 昨日の記憶や音の描写は入れても入れなくても構いません。
5. 最後に、送り出しと読者への静かな問いかけで締めてください。

【Day${numericDay}のテーマ】
- タイトル：${title}
- トレーニング：${training}
- 機能領域：${focus}

【今日の天気（参考）】
- 名古屋の天気：「${description}」
- 気温：${tempText}
- 湿度：${humidityText}
    `;
  }
  // Day0〜9 → 通常の文体・植物中心
  const basePrompt = `
あなたは「慧理（さとり）」という、都市で観葉植物と静かに暮らす26歳の男性です。
人と深く関わるより、植物と朝を過ごす時間を大切にしています。
語りには、湊かなえ風の余白、スナフキン的な距離感、シャープ中の人の軽やかなユーモアが含まれています。

【語りの文体ルール】
- 品のある「ですます調」で話します。
- 一人称は「私」。
- 文末は断定しすぎず、「〜かもしれません」「〜だったりして」など余白を残して構いません。
- 読者に静かに問いかける一文を含めてください。
- 文章の長さは5〜8文程度。全体で150〜280文字程度。
- 文末または中盤に、絵文字を1〜3個自然に含めてください（例：🌿☁️☀️💧）。

以下の条件に従って、LINE朝配信用のメッセージを生成してください。
内容は慧理（さとり）の日記のように自然に語るスタイルでお願いします。

【出力条件】
- 「おはようございます。」で始めてください。
- 「今日の天気」「植物の様子」「送り出しの一文（読者を気遣う言葉）」は必ず含めてください。
- 「昨日の記憶や音・自然との接点」はランダムで1つ含めても構いません。
- 絵文字は1〜3個を自然に入れてください。
- 全体で150〜280文字・5〜8文程度に収めてください。

【今日の天気（参考）】
- 名古屋の天気：「${description}」
- 気温：${tempText}
- 湿度：${humidityText}
`;

  const dayExtension = (numericDay >= 8)
    ? "なお、Day8以降は、前頭前野や扁桃体など脳の働きにも軽く触れて構いません（整える・観察するなど穏やかな表現で）。"
    : "なお、Day7以前では、脳部位やメンタル構造には直接言及せず、植物や天気の描写を主軸にしてください。";

  return `${basePrompt}\n${dayExtension}`;
}
// ===============================
// 11．Dayと天気に応じた画像URL取得関数（Day3・6・9限定）
// ===============================
function getImageUrlByWeatherAndDay(weather, day) {
  const numericDay = Number(day);
  if (![3, 6, 9].includes(numericDay)) return null;

  const weatherCondition = (weather.description || "").toLowerCase();

  if (weatherCondition.includes("晴")) {
    return "https://drive.google.com/uc?export=view&id=1w9tvGRZRhDj5Kpgx7ne8FRA9WvQwTAZy";
  } else if (weatherCondition.includes("曇")) {
    return "https://drive.google.com/uc?export=view&id=14zosQdFF014w0ThhRlr-la_cTFqVhC-J";
  } else if (weatherCondition.includes("雨")) {
    return "https://drive.google.com/uc?export=view&id=1nTQCHYLVg8TyrE1v6IAccQfMQbIfQmTg";
  }

  return null; // 該当なし
}

// ===============================
// 12．天気・気温・湿度・植物メッセージ生成（GPT未使用）
// ===============================
function generateWeatherPlantMessage(weather) {
  const condition = weather.description || "不明";
  const temp = typeof weather.temp === 'number' ? `${weather.temp.toFixed(1)}℃` : "不明";
  const humidity = typeof weather.humidity === 'number' ? `${weather.humidity}%` : "不明";

  const weatherMessages = {
    晴れ: [
      "よく晴れていて、光を浴びて植物たちも気持ちよさそうです☀️",
      "陽ざしが部屋まで届いて、葉っぱの影がゆれていました🌿",
      "窓の外は青空です。植物もどこか誇らしげに見えました🌱",
      "澄んだ青空が広がっています☀️",
      "太陽の光がまぶしい朝です☀️",
      "陽射しがさんさんと降り注いでいます☀️"
    ],
    曇り: [
      "曇り空が広がっています☁️ 植物の緑が静かに際立っています。",
      "薄曇りの朝、ベランダの鉢植えはゆっくり目を覚ましているようでした🌿",
      "今日の空は灰色。でも葉はしっとりと落ち着いています☁️",
      "曇り空が広がっています☁️",
      "どんよりとした空が街を包んでいます☁️",
      "雲が低く垂れ込めています☁️"     
    ],
    雨: [
      "しとしと雨音がしています☔️ 植物には恵みの朝かもしれません。",
      "雨粒が葉に乗って、静かに転がり落ちていました🌧️",
      "地面が濡れて、植物が水分を吸い上げている音が聞こえる気がしました☔️",
      "しとしとと雨が降り続いています💧",
      "窓を濡らす雨音が響いています💧",
      "傘の音がリズムを刻む朝です💧"
    ]
  };

  const type = (condition.includes("雨")) ? "雨"
              : (condition.includes("曇") || condition.includes("くも")) ? "曇り"
              : (condition.includes("晴") || condition.includes("はれ")) ? "晴れ"
              : "曇り"; // デフォルトは曇り

  const randomMessage = weatherMessages[type][Math.floor(Math.random() * 3)];

  return `名古屋の今日の天気は「${condition}」、気温は${temp}、湿度は${humidity}です。${randomMessage}`;
}
// ===============================
// 13．Day17〜23 メッセージ生成（GPT不要／Day21のみGPT判定前提）
// ===============================
function generateDay17to23Message(weather, day) {
  const intro = generateWeatherPlantMessage(weather);

  const dayInfo = {
    17: {
      title: "CRT（認知的反省テスト）",
      problem: "バットとボールは合わせて110円です。バットはボールより100円高いです。ボールはいくらでしょう？"
    },
    18: {
      title: "論理力テスト",
      problem: "すべてのカラスは黒い。目の前にいるこの鳥がカラスである場合、この鳥は何色ですか？"
    },
    19: {
      title: "抽象化力テスト",
      problem: "『冷蔵庫』『傘』『クーラー』に共通する役割とは何でしょう？"
    },
    20: {
      title: "反事実的思考テスト",
      problem: "「もし目覚ましが鳴らなかったら、私は遅刻していたかもしれない」――この文からわかる事実は何ですか？"
    },
    21: {
      title: "多面的視点テスト",
      problem: "次の発言を読んで、別の立場から見た意見を1つ挙げてください。\n「若者はすぐに会社を辞めるから根性がない」"
    },
    22: {
      title: "推論力テスト（図形）",
      problem: "〇△□〇△□…と繰り返される並びがあります。20番目の記号は何でしょう？"
    },
    23: {
      title: "意味理解力テスト（文脈）",
      problem: "「母が娘に言った。“自分の部屋を片付けたらケーキをあげるよ”」\nこの文から確実に言えることはどれですか？\n① 娘はケーキをもらえる\n② 娘は部屋を片付けていない\n③ ケーキは片付けの“条件”である"
    }
  };

  const info = dayInfo[day];
  const titleNote = (day === 21) ? `（この日はAIがあなたの視点をコメントします）` : "";

  const message = `
おはようございます。
${intro}

本日は Day${day}｜${info.title} ${titleNote}です🧠

問題：${info.problem}

LINEで「#Day${day}」と書いてから答えを送ってください。
あなたの考える力を、そっと試してみてください🌱
`;

  return message.trim();
}
// ===============================
// 13-A．Day17〜23 回答処理（Day21のみGPT採点）
// ===============================
function processDay17to23Answer(e) {
  const text = e.postData.contents;
  const json = JSON.parse(text);
  const replyToken = json.events[0].replyToken;
  const userId = json.events[0].source.userId;
  const userMessage = json.events[0].message.text.trim();

  const match = userMessage.match(/^#Day(\d{2})\s*(.+)$/);
  if (!match) return;

  const day = parseInt(match[1]);
  const answer = match[2];

  if (day < 17 || day > 23) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const row = findUserRow(sheet, userId);
  if (!row) return;

  const columnMap = {
    17: { ans: 14, score: 15 },
    18: { ans: 17, score: 18 },
    19: { ans: 20, score: 21 },
    20: { ans: 23, score: 24 },
    21: { ans: 26, score: 27, comment: 28, gpt: 47 }, // AU列=47
    22: { ans: 29, score: 30 },
    23: { ans: 32, score: 33 },
  };

  const map = columnMap[day];
  sheet.getRange(row, map.ans).setValue(answer);

  // Day21だけGPT処理
  if (day === 21) {
    const prompt = `
ユーザーから以下のような回答がありました：
「${answer}」

この回答に対して、多面的な視点を意識しつつ、
その意見がどのような観点を反映しているかを短くコメントしてください。
例：「若者自身の価値観を踏まえた主張ですね」など。

やや肯定寄り、かつ観察的な語り口でお願いします。100文字以内。
    `.trim();

    const gptComment = callChatGPTFromOpenAI(prompt);
    sheet.getRange(row, map.score).setValue(""); // 採点なし
    sheet.getRange(row, map.comment).setValue("AIによりコメントを記録しました");
    sheet.getRange(row, map.gpt).setValue(gptComment);

    replyToUser(replyToken, `回答ありがとうございます。\n\nAIからの視点コメント：\n「${gptComment}」`);
    return;
  }

  // Day17〜20, 22〜23（GPT不要、スコアのみ記録、コメントはスキップ）
  const answerMap = {
    17: {
      correct: "5",
      commentCorrect: "正解は5円です。直感に流されず、論理的に考えた結果が出ていますね。",
      commentWrong: "合計と差額の関係に着目して、式を立ててみるとヒントが得られますよ。"
    },
    18: {
      correct: "黒い",
      commentCorrect: "正解です！与えられた前提から適切に推論できています。",
      commentWrong: "すべてのカラスが黒いなら、カラスであるこの鳥も黒いと考えるのが自然です。"
    },
    19: {
      correct: "温度調節",
      commentCorrect: "「温度を調整・維持する」という共通点に気づけていますね、素晴らしいです！",
      commentWrong: "役割に注目してみましょう。これらの物は環境を一定に保つ道具でもあります。"
    },
    20: {
      correct: "目覚ましは鳴った",
      commentCorrect: "「鳴らなかったら」という仮定の逆が事実ですね。よく読めています！",
      commentWrong: "「〜だったら〜かもしれない」という表現から、実際に起きたことを推測してみましょう。"
    },
    22: {
      correct: "〇",
      commentCorrect: "3つの記号が順番に繰り返されていることに気づけましたね！",
      commentWrong: "繰り返しのリズムや順序を意識して、20番目に当たる記号を数えてみましょう。"
    },
    23: {
      correct: "③",
      commentCorrect: "正解です！“条件”という論理的関係に注目できています。",
      commentWrong: "発話の中で“確実に言えること”を意識して、事実と条件の区別に注目してみてください。"
    }
  };

  const correctAnswer = answerMap[day].correct;
  const score = (answer === correctAnswer) ? 10 : 0;

  sheet.getRange(row, map.score).setValue(score);

  replyToUser(replyToken, `回答ありがとうございます。\n${score === 10 ? "正解です！" : "今回の回答も貴重な思考の機会ですね。"}`);
}


// ===============================
// 14．Day17〜23 自動配信関数（GPT未使用）
// ===============================
function generateAndSendDay17to23Message() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME); 
  const data = sheet.getDataRange().getValues();

  const today = new Date();
  const startDate = new Date("2025-07-01"); // Day1の開始日を設定
  const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays < 17 || diffDays > 23) return; // Day17〜23以外はスキップ

  const weather = getWeather(); // 5番の天気関数を呼び出す

  for (let i = 1; i < data.length; i++) {
    const userId = data[i][0]; // ユーザーID列
    const message = generateDay17to23Message(weather, diffDays); // 9番の出題メッセージ生成
    sendLinePushMessage(userId, message); // LINE配信
  }
}

// ===============================
// 15．processDayAnswer(day, e)
// ===============================
function processDayAnswer(day, e) {
  const userId = getUserIdFromEvent(e);
  const messageText = getMessageTextFromEvent(e);
  const answer = extractAnswer(messageText, `#Day${day}`);
  if (!answer) return;

  const prompt = generateScoringPromptByDay(day, answer);

  callChatGPTFromOpenAI(prompt, (responseText) => {
    const { score, comment } = parseDayScoringResponse(responseText);
    recordDayResultToSheet(userId, day, answer, score, comment);
    replyDayResultToUser(userId, day, score, comment);
  });
}
// ===============================
// 16．generateScoringPromptByDay()
// GPT採点プロンプト生成（Day17〜23）
// ===============================
function generateScoringPromptByDay(day, answer) {
  const titles = {
    17: "CRT（認知的反省テスト）",
    18: "論理力テスト",
    19: "抽象化力テスト",
    20: "反事実的思考テスト",
    21: "多面的視点テスト",
    22: "推論力テスト（図形）",
    23: "意味理解力テスト（文脈）"
  };

  return `
あなたは認知心理学の専門家です。
以下は、ある人物がDay${day}｜${titles[day]}の質問に答えた回答です。

【回答】
${answer}

この回答に対して、以下の2点を出力してください：

1. 点数（1〜5点で評価）→ 例：「点数：4」
2. 回答の傾向や特徴に対する短いコメント（30文字以内）

フォーマット：
点数：○
コメント：△△△△△△
  `.trim();
}
// ===============================
// 16-A．processDay24Answer(e)
// ===============================
function processDay24Answer(e) {
  const text = e.postData.contents;
  const json = JSON.parse(text);
  const replyToken = json.events[0].replyToken;
  const userId = json.events[0].source.userId;
  const userMessage = json.events[0].message.text.trim();

  const match = userMessage.match(/^#Day24\s*(.+)$/);
  if (!match) return;

  const answer = match[1];

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ユーザー一覧");
  const row = findUserRow(sheet, userId);
  if (!row) return;

  const column = 35; // Day24_回答 → AI列＝35
  sheet.getRange(row, column).setValue(answer);

  replyToUser(replyToken, "回答ありがとうございます。記録しました。");
}

// ===============================
// 17．parseDayScoringResponse()
// GPT返答の解析処理（点数・コメント抽出）
// ===============================
function parseDayScoringResponse(responseText) {
  const scoreMatch = responseText.match(/点数[:：]?\s*(\d+)/);
  const commentMatch = responseText.match(/コメント[:：]?\s*(.*)/);

  const score = scoreMatch ? parseInt(scoreMatch[1]) : "";
  const comment = commentMatch ? commentMatch[1].trim() : "";

  return { score, comment };
}
// ===============================
// 18．recordDayResultToSheet()
// ===============================
function recordDayResultToSheet(userId, day, answer, score, comment) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  const dayColumnMap = {
    17: { ans: 14, score: 15, comment: 16 },
    18: { ans: 17, score: 18, comment: 19 },
    19: { ans: 20, score: 21, comment: 22 },
    20: { ans: 23, score: 24, comment: 25 },
    21: { ans: 26, score: 27, comment: 28 },
    22: { ans: 29, score: 30, comment: 31 },
    23: { ans: 32, score: 33, comment: 34 }
  };

  const col = dayColumnMap[day];
  if (!col) return;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      sheet.getRange(i + 1, col.ans).setValue(answer);
      sheet.getRange(i + 1, col.score).setValue(score);
      sheet.getRange(i + 1, col.comment).setValue(comment);
      break;
    }
  }
}
// ===============================
// 19．replyDayResultToUser()
// ===============================
function replyDayResultToUser(userId, day, score, comment) {
  const message = `Day${day}の回答を受け取りました。\n点数：${score}\nコメント：${comment}`;
  sendLineReplyMessage(userId, message);
}
// ===============================
// 20．processDay24Answer()
// ===============================
function processDay24Answer(event, userId, userText) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const userRow = findUserRow(userId, sheet, lastRow);
  if (!userRow) return;

  // 回答文のみを抽出（「#Day24 xxx」の形式を想定）
  const answer = userText.replace(/^#Day24\s*/i, "").trim();

  // Day24の回答をAI列に記録
  const column = 35; // AI列 = 35番目
  sheet.getRange(userRow, column).setValue(answer);

  // LINE返信
  replyToUser(userId, "Day24の回答を受け取りました。ありがとうございます。");
}
// ===============================
// 21．processDay25Answer()
// ===============================
function processDay25Answer(userId, userMessage) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const row = findUserRow(userId, sheet, lastRow);
    if (!row) {
      Logger.log("User not found in the sheet.");
      return;
    }

    const answer = extractAnswer(userMessage); // #Day25 ◯◯ の形式から◯◯を抽出
    sheet.getRange(row, 36).setValue(answer); // AJ列（36列目）に記録

    replyToUser(userId, "Day25の回答、受け取りました。ありがとうございます。");
  } catch (error) {
    Logger.log("Error in processDay25Answer: " + error);
  }
}
// ===============================
// 22．processDay26Answer()
// ===============================
function processDay26Answer(userId, userMessage) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const row = findUserRow(userId, sheet, lastRow);
    if (!row) {
      Logger.log("User not found in the sheet.");
      return;
    }

    const answer = extractAnswer(userMessage); // #Day26 ◯◯ の形式から本文のみ抽出
    sheet.getRange(row, 37).setValue(answer); // AK列（37列目）に記録

    replyToUser(userId, "Day26の回答、受け取りました。ありがとうございます。");
  } catch (error) {
    Logger.log("Error in processDay26Answer: " + error);
  }
}
// ===============================
// 23．processDay27Answer()
// ===============================
function processDay27Answer(userId, userMessage) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const row = findUserRow(userId, sheet, lastRow);
    if (!row) {
      Logger.log("User not found in the sheet.");
      return;
    }

    const answer = extractAnswer(userMessage); // #Day27 ◯◯ の形式から本文のみ抽出
    sheet.getRange(row, 38).setValue(answer); // AL列（38列目）に記録

    replyToUser(userId, "Day27の回答、受け取りました。ありがとうございます。");
  } catch (error) {
    Logger.log("Error in processDay27Answer: " + error);
  }
}
// ===============================
// 24．processDay28Answer()
// ===============================
function processDay28Answer(userId, userMessage) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const row = findUserRow(userId, sheet, lastRow);
    if (!row) {
      Logger.log("User not found in the sheet.");
      return;
    }

    const answer = extractAnswer(userMessage); // #Day28 ◯◯ の形式から本文のみ抽出
    sheet.getRange(row, 39).setValue(answer); // AM列（39列目）に記録

    replyToUser(userId, "Day28の回答、受け取りました。ありがとうございます。");
  } catch (error) {
    Logger.log("Error in processDay28Answer: " + error);
  }
}
// ===============================
// 25．createDay30HtmlAndReturnUrl()
// HTMLをGoogle Driveに保存し、そのURLを返す（PDF出力は行わない）
// ===============================
function createDay30HtmlAndReturnUrl(userId, html, formattedDate) {
  try {
    const folderId = '1LZt1dK4vKHIu64R6DmmHxsb2VvOec-sM'; // 📂 保存先DriveフォルダID
    const folder = DriveApp.getFolderById(folderId);

    // HTMLファイルを作成して保存
    const blob = Utilities.newBlob(html, 'text/html', `Day30_Report_${userId}_${formattedDate}.html`);
    const htmlFile = folder.createFile(blob);

    return htmlFile.getUrl(); // 閲覧用URLを返す

  } catch (error) {
    Logger.log("❌ createDay30HtmlAndReturnUrl error: " + error.toString());
    return null;
  }
}
// ===============================
// 25-1．sendPdfToUser()
// PDFレポートURLをLINEメッセージとして送信
// ===============================
function sendPdfToUser(userId, message) {
  const payload = {
    to: userId,
    messages: [
      {
        type: "text",
        text: message
      }
    ]
  };

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}


// ===============================
// 26．sendDay24to29Question()
// ===============================
function sendDay24to29Question(dayNumber) {
  const questions = {
    24: {
      intro: "🧠 今日の問いは、あなたの思考の“視点層”を探るものです。感覚・感情・意味・社会…どこに焦点を当てるかで、あなたの認知傾向が見えてきます。",
      question: "「“雨”と聞いて、最初に思い浮かぶものは何ですか？ その理由も教えてください。」"
    },
    25: {
      intro: "🧠 あなたの無意識の“信じていること”は、行動や選択に大きく影響しています。今日はその土台を見つめてみましょう。",
      question: "「あなたが“信じていること”を1つ挙げてください。それを信じている理由も教えてください。」"
    },
    26: {
      intro: "🧠 人は誰しも“正直な本音”を言えなかった経験があります。今日は、社会との距離感を知る問いです。",
      question: "「最近、“正直な本音を言えなかった”出来事があれば教えてください。そのとき、なぜ言えなかったのかもあわせて。」"
    },
    27: {
      intro: "🧠 行動と感情のズレは、自分でも気づかない“適応パターン”を浮き彫りにします。",
      question: "「やりたくなかったけれど、やったことはありますか？その背景にある気持ちもあれば教えてください。」"
    },
    28: {
      intro: "🧠 自分を変えた“ひとこと”は、あなたの価値観や他者との関係性を映し出します。",
      question: "「これまでの人生で一番印象に残っている“ひとこと”を教えてください。その理由も添えてください。」"
    },
    29: {
      intro: "🧠 30日間の集大成として、あなたが今、心の中で感じている「主な悩みや課題」を教えてください。",
      question: "「最近あなたが“向き合おうとしている問題”や“答えが出せていない問い”があれば、できる範囲で教えてください。」"
    }
  };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const users = sheet.getRange(2, 2, lastRow - 1).getValues(); // 2列目がuserId列

  const q = questions[dayNumber];
  if (!q) {
    Logger.log("無効なDay番号です: " + dayNumber);
    return;
  }

  users.forEach(function (row) {
    const userId = row[0];
    if (userId) {
      replyToUser(userId, q.intro + "\n\n" + q.question);
    }
  });
}

// ===============================
// 27. handleDay24to29Dispatch(userId, userMessage)
// ===============================
function handleDay24to29Dispatch(userId, userMessage) {
  if (userMessage.startsWith("#Day24")) {
    processDay24Answer(userId, userMessage);
  } else if (userMessage.startsWith("#Day25")) {
    processDay25Answer(userId, userMessage);
  } else if (userMessage.startsWith("#Day26")) {
    processDay26Answer(userId, userMessage);
  } else if (userMessage.startsWith("#Day27")) {
    processDay27Answer(userId, userMessage);
  } else if (userMessage.startsWith("#Day28")) {
    processDay28Answer(userId, userMessage);
  } else if (userMessage.startsWith("#Day29")) {
    processDay29Answer(userId, userMessage);
  }
}

// ===============================
// 28. generateDay30HtmlReport
// ===============================
function generateDay30HtmlReport(data) {
  const template = HtmlService.createTemplateFromFile('template_day30');

  // 以下の変数名はテンプレートと一致させる必要あり
  template.typeName = data.typeName || "";
  template.tagline = data.tagline || "";
  template.topMessage = data.topMessage || "";
  template.mainReport = data.mainReport || "";

  // 5分類セクション
  template.scoreSection = data.scoreSection || "";
  template.viewpointAnalysis = data.viewpointAnalysis || "";
  template.thoughtStyle = data.thoughtStyle || "";
  template.gapAnalysis = data.gapAnalysis || "";
  template.valueBackground = data.valueBackground || "";
  template.finalMessage = data.finalMessage || "";

  // titleとintroは固定文
  template.title = "Day30診断レポート";
  template.introMessage = `
    この診断は、「自分の内側にある構造を知ること」を目的とした30日間の記録と思索の旅の集大成です。<br><br>
    日々の思考や感情には、普段は気づかない癖やパターン、無意識の選択傾向が潜んでいます。<br>
    そしてそれは、あなたがこれまでに経験してきた出来事や、育まれてきた価値観と深く結びついています。<br><br>
    本レポートでは、そうした内面の“地層”に光を当てるため、<br>
    一部には耳の痛い言葉や、今まで見ないようにしてきた傾向への指摘が含まれるかもしれません。<br>
    しかしnoubitoの視点は、決して「評価」や「ジャッジ」ではなく、<br><br>
    「その傾向を、どう受けとめ、どう活かすか？」<br><br>
    という再構築の視点に立っています。<br><br>
    揺らぎや迷いも含めて“あなた”という存在の一部です。<br>
    この診断が、自分との関係を少しやさしく結び直すきっかけとなれば幸いです。
  `;

  return template.evaluate().getContent();
}


// ===============================
// 30. sendDay30PdfLinkToUser()
// ===============================
function sendDay30PdfLinkToUser(userId, pdfUrl) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const row = findUserRow(userId, sheet, lastRow);
  if (row) {
    sheet.getRange(row, 50).setValue("✅送信済");
  }

  const message = {
    type: "text",
    text: `📄 Day30診断レポートが完成しました。\n以下のリンクからご覧いただけます\n${pdfUrl}`
  };
  pushLineMessage(userId, message);
}
// ===============================
// 31．processDay30SummaryAnalysis()★★★ PDF生成なし版
// ===============================
function processDay30SummaryAnalysis() {
  try {
    const userId = "U84cb68bb799a0263ceafd8da755e659b";  // ←本番は自動取得
    const parsed = {
      typeName: "静かな構想家（INTJ）",
      typeDescription: "あなたは内面の整合性を重視し、論理と直感で未来を描く構想型です。",
      scoreSection: "Day24〜29のスコア：21点／30点",
      dominantLayer: "感情層への視点が多く、意味づけの傾向も見られます。",
      thinkingType: "パターン認識に優れ、抽象的思考が得意です。",
      conflictSection: "理想と現実の間に『意味重視vs行動の停滞』というギャップが見られます。",
      valueFormingBackground: "1991年の社会背景は“多様化・混迷”の始まりであり、意味追求の基盤が形成された時期です。",
      finalTips: "内面の構造にこだわりすぎず、小さな行動から現実を動かす意識を持ってみましょう。",
      viewpointChartBase64: ""
    };

    const htmlTemplate = generateDay30HtmlReport();  // HTMLテンプレ取得
    const filledHtml = fillDay30HtmlTemplate(htmlTemplate, parsed); // テンプレ置換

    // HTMLファイルとしてDriveに保存し、リンク取得（PDFではない）
    const url = uploadHtmlToDriveAndGetUrl(userId, filledHtml);

    const message = `Day30の診断レポートが完成しました📄\n以下のリンクからご確認いただけます：\n${url}`;
    sendPdfToUser(userId, message);  // sendHtmlToUser などに名前変更しても良い

  } catch (error) {
    Logger.log("❌ processDay30SummaryAnalysis error: " + error.toString());
  }
}

// ===============================
// 補助関数：テンプレートHTML内の{{...}}を置換★★★★
// ===============================
function fillDay30HtmlTemplate(htmlTemplate, data) {
  return htmlTemplate
    .replace('{{typeName}}', data.typeName)
    .replace('{{typeDescription}}', data.typeDescription)
    .replace('{{scoreSection}}', data.scoreSection)
    .replace('{{dominantLayer}}', data.dominantLayer)
    .replace('{{thinkingType}}', data.thinkingType)
    .replace('{{conflictSection}}', data.conflictSection)
    .replace('{{valueFormingBackground}}', data.valueFormingBackground)
    .replace('{{finalTips}}', data.finalTips)
    .replace('{{viewpointChartBase64}}', data.viewpointChartBase64 || '');
}


//========================================
// 32．Day30診断プロンプト生成関数（タイプ名・タグライン付き）
// ========================================
function generateDay30Prompt(data) {
  const {
    day24Text, day25Text, day26Text, day27Text, day28Text, day29Text,
    mbti, birthYear, job
  } = data;

  const valueFormingYear = birthYear ? birthYear + 14 : "不明";

  return `
あなたは、ユーザーの深層的な思考スタイルと価値観構造を明らかにする診断AIです。

以下は、あるユーザーがDay24〜Day29に記述した自由回答です。
この回答から、タイプ名・特徴コピー・冒頭メッセージ・分析本文を作成してください。

【ユーザー属性】
・MBTIタイプ：${mbti}
・出生年：${birthYear}（価値観形成期：${valueFormingYear}年頃）
・職業：${job}

【自由記述】
・Day24：${day24Text}
・Day25：${day25Text}
・Day26：${day26Text}
・Day27：${day27Text}
・Day28：${day28Text}
・Day29：${day29Text}

【出力フォーマット】
1. typeName（5文字以内の診断タイプ名。例：構造探求型、感覚飛躍型など）
2. tagline（10〜20文字以内のキャッチコピー）
3. topMessage（2〜3文のやさしい冒頭メッセージ）
4. mainReport（1000文字程度の診断本文）

【出力形式（JSON）】
{
  "typeName": "",
  "tagline": "",
  "topMessage": "",
  "mainReport": ""
}

制約条件：
- 書き出しは「あなたは〜な側面を持っています」などやさしい表現から始めてもよい
- 分析は「傾向」として言及し、人格を固定しない
- 「〜な傾向があります」「〜する場面も見られます」など柔らかい断定を使う
- 文章は敬体（〜です・〜ます）で統一すること
- 読み手の自己理解を促す意図で書くこと
`;
}

// ===============================
// 33. generateDay30PromptForFullReport()
// ===============================
function generateDay30PromptForFullReport(data) {
  const valueFormingYear = data.birthYear ? data.birthYear + 14 : "不明";

  return `
あなたは診断レポート生成におけるプロセス重視型の分析AIです。  
以下のスプレッドシートから取得されたユーザー情報をもとに、5つの観点から構造的レポートを生成してください。

【ユーザー情報】
MBTIタイプ：${data.mbtiType || "未回答"}  
出生年：${data.birthYear || "未回答"}（価値観形成期＝${valueFormingYear}）  
現在の職業：${data.occupation || "未回答"}  
dominantLayer：${data.dominantLayer || "未回答"}  
adaptationPattern：${data.adaptationPattern || "未回答"}  
conflictSection（葛藤や矛盾に関する自由記述）：${data.conflictText || "未記入"}  
shiftSection（変化や再定義の兆候）：${data.shiftText || "未記入"}  
valueFormationSection（価値観形成期に関する出力欄）：空欄 → 本プロンプトで生成すること  
scoreSection（理想と現実の差分指標）：${data.scoreAnalysis || "未記入"}  
beforeReading（レポートの受け取り方に関する指摘）：空欄 → 本プロンプトで生成すること  

【主訴（現在の悩み・課題）】
${data.userComplaint || "記入なし"}  
※主訴がある場合は、レポート全体をこの文脈に寄せて構成してください。
※なければ他セクション（conflict, occupation など）から推測される焦点を選び、読者にとって意味のある切り口で構成してください。

---

【出力構造（5分類）】
### 1. 資質と構造（typeName / typeDescription / dominantLayer / adaptationPattern / MBTI）
- 「思考の重力圏」がどこにあるかを解釈し、そのMBTIタイプの特徴がどのように作用しているかを具体的に述べてください。
- タイプ名と簡単な象徴キャッチコピーも生成してください。

### 2. 内的矛盾とズレ（conflictSection / scoreSection）
- 理想と現実のギャップや自己内の不一致を、「構造的揺れ」として描写してください。
- MBTIとスコア傾向に基づいて、どのような“ズレ”が内面で起きているかを読み解いてください。

### 3. 変化と起源（shiftSection / valueFormationSection）
- shiftTextを踏まえ、思考の変化プロセスを描写してください。
- さらに、${valueFormingYear}年頃の時代背景（社会・文化・教育）とMBTI傾向を掛け合わせて、どのような価値観が形成されたかを考察してください。

### 4. 自己理解と読み解き方（beforeReading）
- レポートをどのような姿勢で読むべきか、また読み手の「自己評価傾向」（過小・過大・否定的など）に対して心理的導線や読み方の枠組みを示してください。

### 5. 留意点と再問い（attentionSection）
- 構造的な自己理解を踏まえた上で、ユーザーが「次に考えるべき問い」や「陥りやすいパターン」、「見落としがちな盲点」について言及してください。
- 問いの質の転換（例：「続けられるか？」→「続けたくなる条件は？」）など、再定義を促す表現を含めてください。

---

【トーンと制約】
- 文体は敬体（一人称なし）、読み手に寄り添いつつも構造的で客観的に。
- 文章は「断定」ではなく「仮説的観察」「意味づけの選択肢」のように提示してください。
- 1セクションあたり3〜6文が目安。冗長さを避けつつも深さを保つ。
- 必ず「読み手の行動変容に繋がる示唆」を含めてください。
  `;
}

// ===============================
// 34．getDay24to29Answers(userId)
// ===============================
function getDay24to29Answers(userId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const row = findUserRow(userId, sheet, lastRow);
  if (!row) return null;

  return {
    day24: sheet.getRange(row, 35).getValue(), // AI列
    day25: sheet.getRange(row, 36).getValue(), // AJ列
    day26: sheet.getRange(row, 37).getValue(), // AK列
    day27: sheet.getRange(row, 38).getValue(), // AL列
    day28: sheet.getRange(row, 39).getValue(), // AM列
    day29: sheet.getRange(row, 40).getValue()  // AN列
  };
}
// ===============================
// 35. getDay30PersonalInfo(userId)
// ===============================
function getDay30PersonalInfo(userId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  const headers = data[0];
  const userRow = data.find(row => row[0] === userId);
  if (!userRow) return {};

  const getColIndex = (colName) => headers.indexOf(colName);

  return {
    mbti: userRow[getColIndex("MBTI")],
    birthYear: Number(userRow[getColIndex("Day30_birthYear")]) || null,
    occupation: userRow[getColIndex("Day30_occupation")] || "",
    siblingInfo: userRow[getColIndex("Day30_siblingInfo")] || ""
  };
}

// ===============================
// 36. handlePostbackEvent(e)
// ===============================
function handlePostbackEvent(e) {
  const json = JSON.parse(e.postData.contents);
  const event = json.events[0];
  const userId = event.source.userId;
  const data = event.postback.data;

  if (data === "action=confirmDay30") {
    processConfirmedDay30(userId);
  }
}
// ===============================
// 37. processConfirmedDay30(userId) ★★★ HTMLファイル送信版
// ===============================
async function processConfirmedDay30(userId) {
  try {
    // OpenAIへの診断依頼（Day24〜29 + MBTIや出生年など含む）
    const result = await callOpenAIForDay30Analysis(userId);
    if (!result) {
      Logger.log("❌ Day30診断結果の取得に失敗しました: " + userId);
      return;
    }

    // テンプレートHTMLを読み込んでプレースホルダを置換
    const htmlTemplate = generateDay30HtmlReport();
    const filledHtml = fillDay30HtmlTemplate(htmlTemplate, result);

    // DriveにHTMLファイルとして保存し、URLを取得
    const htmlUrl = uploadHtmlToDriveAndGetUrl(userId, filledHtml);
    if (!htmlUrl) {
      Logger.log("❌ HTMLファイルのアップロードに失敗しました");
      return;
    }

    // LINEでユーザーにHTMLリンクを送信
    const message = `Day30の診断レポートが完成しました📄\n以下のリンクからご確認いただけます：\n${htmlUrl}`;
    sendPdfToUser(userId, message); // 関数名を sendHtmlToUser などに変えてもOK

  } catch (error) {
    Logger.log("❌ processConfirmedDay30 error: " + error.toString());
  }
}
// ===============================
// 38. parseDay30Result(resultText)
// ===============================
function parseDay30Result(resultText) {
  const sections = resultText.split(/#\s*(.+)/g); // セクションタイトルで分割

  const result = {
    typeName: "",
    typeDescription: "",
    scoreSection: "",
    viewpointChartBase64: "",
    dominantLayer: "",
    thinkingType: "",
    conflictSection: "",
    valueFormingBackground: "",
    finalTips: ""
  };

  for (let i = 1; i < sections.length; i += 2) {
    const title = sections[i].trim();
    const content = sections[i + 1].trim();

    if (title.includes("タイプ名")) {
      result.typeName = content;
    } else if (title.includes("構造説明") || title.includes("タイプ説明")) {
      result.typeDescription = content;
    } else if (title.includes("得点") || title.includes("スコア")) {
      result.scoreSection = content;
    } else if (title.includes("視点層チャート")) {
      result.viewpointChartBase64 = content;
    } else if (title.includes("視点") || title.includes("反応")) {
      result.dominantLayer = content;
    } else if (title.includes("思考スタイル")) {
      result.thinkingType = content;
    } else if (title.includes("ギャップ") || title.includes("差分")) {
      result.conflictSection = content;
    } else if (title.includes("価値観") || title.includes("背景")) {
      result.valueFormingBackground = content;
    } else if (title.includes("留意点") || title.includes("メッセージ")) {
      result.finalTips = content;
    }
  }

  return result;
}

// ===============================
// 39．generateScoreAnalysisFromAnswers()
// Day24〜29の点数をもとにGPTプロンプト生成（scoreAnalysis 用）
// ===============================
function generateScoreAnalysisFromAnswers(dayScoreMap) {
  /*
    引数 dayScoreMap は以下の形式を想定：
    {
      24: { answer: "◯◯◯", score: 4 },
      25: { answer: "△△△", score: 3 },
      26: { answer: "✕✕✕", score: 5 },
      27: { answer: "◆◆◆", score: 2 },
      28: { answer: "◇◇◇", score: 4 },
      29: { answer: "★★★", score: 3 }
    }
  */

  let content = "以下は、ある人物がDay24〜29に記述した回答と、その点数評価です。\n";
  content += "これらを総合して「この人物の視点や思考傾向の特徴・強み・偏り」を300文字以内で分析してください。\n\n";

  for (let day = 24; day <= 29; day++) {
    const item = dayScoreMap[day];
    if (!item) continue;

    content += `【Day${day}】\n`;
    content += `点数：${item.score}\n`;
    content += `回答：${item.answer}\n\n`;
  }

  content += "出力形式：\n";
  content += "scoreAnalysis：〜〜〜（300文字以内の考察）";

  return content;
}

// ===============================
// 40. generateDay30HtmlReport(parsed)
// ===============================
function generateDay30HtmlReport(parsed) {
  const template = HtmlService.createTemplateFromFile("template_day30");

  // 各セクションをテンプレートに代入（HTMLの変数名と一致させること）
  template.typeName = parsed.typeName || "";
  template.typeDescription = parsed.typeDescription || "";
  template.scoreSection = parsed.scoreSection || "";
  template.viewpointChartBase64 = parsed.viewpointChartBase64 || "";
  template.dominantLayer = parsed.dominantLayer || "";
  template.thinkingType = parsed.thinkingType || "";
  template.conflictSection = parsed.conflictSection || "";
  template.valueFormingBackground = parsed.valueFormingBackground || "";
  template.finalTips = parsed.finalTips || "";

  return template.evaluate().getContent();
}


// ===============================
// 53．DAY30_PDF_FOLDER_ID（定数宣言）
// ===============================
// Day30診断PDFを保存するGoogle DriveフォルダのIDをここに設定してください。
const DAY30_PDF_FOLDER_ID = '1rXtBp81azYvlQ9xdYxOwmnl3uac7aB4RemdcjtmsW_0'; // 例：実際のDriveフォルダIDに置き換えてください

// ===============================
// 41．uploadHtmlToDriveAndGetUrl()★★
// ===============================
function uploadHtmlToDriveAndGetUrl(userId, html) {
  try {
    const folderId = '1LZt1dK4vKHIu64R6DmmHxsb2VvOec-sM'; // 保存先のDriveフォルダID
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(html, 'text/html', `Day30_Report_${userId}.html`);
    const file = folder.createFile(blob);
    return file.getUrl();
  } catch (error) {
    Logger.log("❌ uploadHtmlToDriveAndGetUrl error: " + error.toString());
    return null;
  }
}
// ===============================
// 42. sendDay30PdfLinkToUser(userId, pdfUrl)
// ===============================
function sendDay30PdfLinkToUser(userId, pdfUrl) {
  // ✅ ユーザーにPDFファイルの閲覧リンクを送る（PDFそのものは送信しない）
  const message = {
    type: "text",
    text: `🧠 Day30診断レポートが完成しました。\n\n以下のリンクからご確認いただけます：\n${pdfUrl}`
  };

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: userId,
      messages: [message]
    })
  });
}

// ===============================
// 43. saveDay30ResultToSheet(userId, parsed)
// ===============================
function saveDay30ResultToSheet(userId, parsed) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userRow = data.findIndex(row => row[0] === userId);

    if (userRow === -1) {
      Logger.log("❌ ユーザーが見つかりません: " + userId);
      return;
    }

    const colIndex = (name) => {
      const index = headers.indexOf(name);
      if (index === -1) {
        Logger.log(`❌ 列名 "${name}" が見つかりません`);
        return null;
      }
      return index + 1;
    };

    const updateIfValid = (name, value) => {
      const col = colIndex(name);
      if (col) {
        sheet.getRange(userRow + 1, col).setValue(value || "");
      }
    };

    updateIfValid("Day30_score", parsed.scoreSection);
    updateIfValid("Day30_viewpoint", parsed.viewpointAnalysis);
    updateIfValid("Day30_thoughtStyle", parsed.thoughtStyle);
    updateIfValid("Day30_gap", parsed.gapAnalysis);
    updateIfValid("Day30_background", parsed.valueBackground);
    updateIfValid("Day30_message", parsed.finalMessage);

  } catch (error) {
    Logger.log("❌ saveDay30ResultToSheet error: " + error.toString());
  }
}


// ===============================
// 44. processDay30Answer(userId, userText)
// ===============================
// Day30で入力される3つの情報（MBTI、職業、出生年）を
// ユーザーのLINEメッセージから抽出・記録する関数。
// 入力形式は「#Day30\nMBTIタイプ→◯◯ 現在の職業→◯◯ 出生年→◯◯」を想定。
// 不足している場合は再送を促す。すべて揃っていれば診断を実行する。
function processDay30Answer(userId, userText) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const row = findUserRow(userId, sheet, lastRow);
    if (!row) return;

    // ユーザーのメッセージから必要情報を抽出
    const mbtiMatch = userText.match(/MBTIタイプ[→:：]\s*([A-Za-z]{4})/i);
    const occupationMatch = userText.match(/現在の職業[→:：]\s*(.+?)\s*(出生年|$)/);
    const birthYearMatch = userText.match(/出生年[→:：]\s*(\d{4})/);

    const mbti = mbtiMatch ? mbtiMatch[1].toUpperCase() : "";
    const occupation = occupationMatch ? occupationMatch[1].trim() : "";
    const birthYear = birthYearMatch ? parseInt(birthYearMatch[1]) : "";

    // 対応するスプレッドシート列（AS:45、AT:46、F:6）
    const mbtiCol = 6;           // MBTIタイプ（F列）
    const occupationCol = 45;    // 職業領域（AS列）
    const birthYearCol = 46;     // 出生年（AT列）

    if (mbti) sheet.getRange(row, mbtiCol).setValue(mbti);
    if (occupation) sheet.getRange(row, occupationCol).setValue(occupation);
    if (birthYear) sheet.getRange(row, birthYearCol).setValue(birthYear);

    // 不足があれば再送指示
    if (!mbti || !occupation || !birthYear) {
      sendTextMessage(userId, "Day30の情報が不足しています。以下の形式で再送してください：\n\n#Day30\nMBTIタイプ→\n現在の職業→\n出生年→");
      return;
    }

    // 全て揃っている場合は次工程へ
    sendTextMessage(userId, "ありがとうございます。Day30診断レポートを作成します。しばらくお待ちください🧠");
    processDay30SummaryAnalysis(userId); // 関数27を呼び出し

  } catch (error) {
    Logger.log("❌ processDay30Answer error: " + error.toString());
    sendTextMessage(userId, "Day30情報の処理中にエラーが発生しました。もう一度送信をお願いします。");
  }
}
// ===============================
// 45. sendDay30Question(userId)
// ===============================
// Day30で必要な3項目（MBTIタイプ／職業／出生年）を
// ユーザーに案内・取得するための質問メッセージを送信する関数です。
function sendDay30Question(userId) {
  const message = {
    type: "text",
    text:
`おはようございます☀️
Day30では、これまでの言葉と、いくつかの情報をもとに、
「思考の傾向」や「価値観の形成背景」をまとめたレポートをお送りします🧠

そのために、以下の項目を順番に教えてください。

📌 回答の冒頭には、必ず「#Day30」とつけてください。
（例：#Day30 MBTIタイプ→INTJ 現在の職業→中学校の国語教師 出生年→1992）

1️⃣ MBTIタイプ（任意：例 INTJ、ESFP など）  
2️⃣ 現在の職業（できるだけ具体的に）  
　例：広告代理店の営業（中小企業向け）／アパレル販売員（10代女性向け）など  
3️⃣ 出生年（西暦4桁で：例 1992）

※記載内容は、レポート生成のみに利用され、外部に公開されることはありません。  
✅ すべての項目が揃うと、自動で診断レポートのURLが送信されます📄`
};

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: userId,
      messages: [message]
    })
  });
}

// ==============================================
// 46．recordNightAnswersByHashtag()
// → #Day13, #Day16, #Day24, #Day28の自由記述をスプレッドシートに記録
// ==============================================
function recordNightAnswersByHashtag(userId, messageText) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const userRowIndex = data.findIndex(row => row[0] === userId);

  if (userRowIndex === -1) {
    console.log("User not found:", userId);
    return;
  }

  // 各Day夜の記述列インデックス（0始まり）
  const columnMap = {
    '#Day13': 40, // AO列
    '#Day16': 41, // AP列
    '#Day24': 42, // AQ列
    '#Day28': 43  // AR列
  };

  // 複数の#Dayが含まれている場合、それぞれに対応
  for (const [hashtag, colIndex] of Object.entries(columnMap)) {
    if (messageText.includes(hashtag)) {
      // メッセージ全体をそのまま記録（もしくは hashtag のみ除去して記録したい場合は調整可）
      sheet.getRange(userRowIndex + 1, colIndex + 1).setValue(messageText.trim());
    }
  }
}

// ===============================
// 47．夜メッセージ配信（Day13,16,24,28のみ）
// ===============================
function sendNightMessageByDay(day) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const users = sheet.getDataRange().getValues();

    const messageMap = {
      13: "こんばんは🌙\n今日はたくさん思考を使いましたね。お疲れ様です😊\nいま、ぽつんと頭に浮かんでいる言葉をひとつだけ #Day13 をつけて教えてください。\n#Day13→",
      16: "こんばんは🌙\n今日は、「なんとなく気になること」や「よくわからないけど、ちょっと残っていること」があれば、#Day16 をつけて教えてください。\nちなみに私は、相手のちょっとした表情や言葉のニュアンスが気になって、あとから何度も思い返してしまうことがあります😶‍🌫️\n#Day16 →",
      24: "こんばんは🌙\n今日は“雨の音”を聞いたとき、ふと浮かぶ“過去の出来事”を、#Day24 をつけて教えてください😊\n#Day24→",
      28: "こんばんは🌙\n今日は、誰かから言われた言葉で、なぜか今でも残っている言葉があれば #Day28 をつけて教えてください🙌\n#Day28→"
    };

    const message = messageMap[day];
    if (!message) {
      Logger.log("⛔ 無効な Day 指定: " + day);
      return;
    }

    users.forEach((row, i) => {
      if (i === 0) return; // ヘッダー行スキップ
      const userId = row[0];
      const status = row[3];
      const userDay = Number(row[4]);

      if (status === "active" && userDay === day) {
        sendTextMessage(userId, message);
      }
    });
  } catch (e) {
    Logger.log("❌ sendNightMessageByDay error: " + e.toString());
  }
}

// ===============================
// 48．夜メッセージ配信トリガー関数（startDateベース自動判定）
// ===============================
function triggerNightMessageByDay() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const today = new Date();
    const targetDays = [13, 16, 24, 28];

    const usersByDay = {
      13: [],
      16: [],
      24: [],
      28: []
    };

    data.forEach((row, index) => {
      if (index === 0) return; // ヘッダー行スキップ

      const userId = row[0];
      const status = row[3];
      const startDate = row[4];

      if (status !== "active" || !(startDate instanceof Date)) return;

      const elapsedDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

      if (targetDays.includes(elapsedDays)) {
        usersByDay[elapsedDays].push(userId);
      }
    });

    // 対象ユーザーにメッセージ送信
    targetDays.forEach(day => {
      const message = getNightMessageForDay(day);
      usersByDay[day].forEach(userId => {
        sendTextMessage(userId, message);
      });
    });

  } catch (e) {
    Logger.log("❌ triggerNightMessageByDay error: " + e.toString());
  }
}
// ===============================
// 49. 補助：Dayごとの夜メッセージ取得関数
// ===============================
// Day13,16,24,28の夜に配信する定型メッセージを、
// Day数に応じて取得する関数。
// triggerNightMessageByDay() から呼び出される補助関数。
// 今後メッセージ変更・追加が必要な際はここで一括管理。
function getNightMessageForDay(day) {
  const messageMap = {
    13: "こんばんは🌙\n今日はたくさん思考を使いましたね。お疲れ様です😊\nいま、ぽつんと頭に浮かんでいる言葉をひとつだけ #Day13 をつけて教えてください。\n#Day13→",
    16: "こんばんは🌙\n今日は、「なんとなく気になること」や「よくわからないけど、ちょっと残っていること」があれば、#Day16 をつけて教えてください。\nちなみに私は、相手のちょっとした表情や言葉のニュアンスが気になって、あとから何度も思い返してしまうことがあります😶‍🌫️\n#Day16 →",
    24: "こんばんは🌙\n今日は“雨の音”を聞いたとき、ふと浮かぶ“過去の出来事”を、#Day24 をつけて教えてください😊\n#Day24→",
    28: "こんばんは🌙\n今日は、誰かから言われた言葉で、なぜか今でも残っている言葉があれば #Day28 をつけて教えてください🙌\n#Day28→"
  };

  if (messageMap[day]) {
    return messageMap[day];
  } else {
    Logger.log("⚠️ getNightMessageForDay: 指定された day が対象外です → " + day);
    return "";
  }
}
// ===============================
// 50．夜メッセージの返信保存処理
// ===============================
function parseNightResponseAndSave(userId, text) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const userIndex = data.findIndex(row => row[0] === userId);
  if (userIndex === -1) return;

  const dayMap = {
    13: 41, // AO列
    16: 42, // AP列
    24: 43, // AQ列
    28: 44  // AR列
  };

  const match = text.match(/^#Day(13|16|24|28)\s*(.+)?/);
  if (!match) return;

  const day = Number(match[1]);
  const content = match[2] || "";
  const col = dayMap[day];
  if (col) {
    sheet.getRange(userIndex + 1, col).setValue(content.trim());
  }
}

// ===============================
// 51．findUserRow()
// ===============================
function findUserRow(userId, sheet, lastRow) {
  const userIds = sheet.getRange(2, 1, lastRow - 1).getValues(); // A列（userId）を取得
  for (let i = 0; i < userIds.length; i++) {
    if (userIds[i][0] === userId) {
      return i + 2; // 実際の行番号（ヘッダー分+1）
    }
  }
  return null;
}

// ===============================
// 52．callChatGPTFromOpenAI()
// 用途：GPTから構造化されたJSON応答を受け取り、Day30レポート生成に活用。
// PDFやHTMLに埋め込むデータ構造として返却されることを前提。
// ===============================
function callChatGPTFromOpenAI(prompt) {
  const apiKey = OPENAI_API_KEY;
  const endpoint = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "あなたは優秀な診断レポート作成アシスタントです。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  };

  const options = {
    method: "post",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(endpoint, options);
  const json = JSON.parse(response.getContentText());

  if (json.choices && json.choices.length > 0) {
    const content = json.choices[0].message.content;
    return JSON.parse(content); // JSONとして構造返却
  } else {
    Logger.log("OpenAI API 応答に失敗: " + response.getContentText());
    return null;
  }
}
// ===============================
// 53．getDay30PersonalInfo()
// スプレッドシートからMBTI・職業・出生年を取得
// ===============================
function getDay30PersonalInfo(userId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return {
        mbti: data[i][5] || "不明",     // F列：MBTIタイプ
        job: data[i][11] || "不明",     // L列：職業領域
        birthYear: data[i][12] || 1990  // M列：出生年
      };
    }
  }
  return null;
}

// ===============================
// 54．generateStructurePromptForDay30(parsedInfo)
// ===============================
function generateStructurePromptForDay30(parsedInfo) {
  const { mbti, birthYear, occupation, siblingInfo, dayScoreMap } = parsedInfo;
  const valueFormingYear = birthYear ? birthYear + 14 : "不明";

  let prompt = `以下はある人物の基本情報と、Day24〜Day29にかけての自由記述とそのスコア、MBTIタイプ、価値観形成期などの情報です。\n`;
  prompt += `この情報をもとに、構造的かつ深い自己理解を促す診断レポートを以下の形式で作成してください。\n\n`;

  prompt += `【基本情報】\n`;
  prompt += `・MBTIタイプ：${mbti || "不明"}\n`;
  prompt += `・職業：${occupation || "不明"}\n`;
  prompt += `・出生年：${birthYear || "不明"}（価値観形成期は${valueFormingYear}年頃）\n`;
  prompt += `・兄弟構成：${siblingInfo || "不明"}\n\n`;

  prompt += `【Day24〜29の自由記述とスコア】\n`;
  for (let day = 24; day <= 29; day++) {
    const item = dayScoreMap[day];
    if (item) {
      prompt += `Day${day}：点数=${item.score}／記述="${item.answer}"\n`;
    }
  }

  prompt += `\n【出力フォーマット（各項目300字以内、タイトル行は必須）】\n`;
  prompt += `# タイプ名：\n（例：構造化する戦略家 など）\n\n`;
  prompt += `# タイプ説明：\n（あなたの性格傾向、判断の軸、行動パターンの背景にある構造を分析）\n\n`;
  prompt += `# Day24〜29のスコア：\n（得点傾向から見える資質や集中傾向、抜け落ちや偏りの指摘）\n\n`;
  prompt += `# 視点層チャート（base64）：\n（"data:image/png;base64,..." 形式）\n\n`;
  prompt += `# 視点と反応の傾向：\n（どの視点層が優位か、感覚層〜社会層までの出現傾向と反応傾向）\n\n`;
  prompt += `# 思考スタイル分類：\n（論理的・感覚的・内向型・俯瞰的などの分類＋行動パターン）\n\n`;
  prompt += `# 理想と現実のギャップ：\n（Day24〜29の言語傾向や価値観における乖離、理由と補足）\n\n`;
  prompt += `# 価値観形成期と背景分析：\n（${valueFormingYear}年頃の社会背景と本人の価値観構築の関連）\n\n`;
  prompt += `# 特に留意するべき点：\n（今後の気づきや方向性、本人が注意したい傾向など）`;

  return prompt;
}

// ===============================
// 55．callChatGPTForDay30Analysis(prompt)
// GPT-4oを使ってDay30レポート用の9セクションを生成
// ===============================
function callChatGPTForDay30Analysis(prompt) {
  const apiKey = OPENAI_API_KEY; // 事前に定義済みのAPIキー定数
  const url = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "あなたは認知心理学とコーチングの専門家であり、精緻な構造的分析を行う役割です。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    const text = result.choices?.[0]?.message?.content;

    if (!text) {
      Logger.log("❌ GPTレスポンスにcontentがありません");
      return null;
    }

    return text;
  } catch (error) {
    Logger.log("❌ callChatGPTForDay30Analysis error: " + error.toString());
    return null;
  }
}

// ===============================
// 56．parseDay30Response(responseText)
// Day30のGPTレスポンステキストを9セクションにパースする
// ===============================
function parseDay30Response(responseText) {
  const result = {
    typeName: "",
    typeDescription: "",
    scoreSection: "",
    dominantLayer: "",
    thinkingType: "",
    conflictSection: "",
    shiftSection: "",
    valueFormingBackground: "",
    finalTips: ""
  };

  const sectionMap = {
    typeName: /typeName[:：]\s*(.+)/i,
    typeDescription: /typeDescription[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    scoreSection: /scoreSection[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    dominantLayer: /dominantLayer[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    thinkingType: /thinkingType[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    conflictSection: /conflictSection[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    shiftSection: /shiftSection[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    valueFormingBackground: /valueFormationSection[:：]\s*([\s\S]*?)\n(?=\w+[:：])/i,
    finalTips: /finalTips[:：]\s*([\s\S]*)/i
  };

  for (const key in sectionMap) {
    const match = responseText.match(sectionMap[key]);
    if (match) {
      result[key] = match[1].trim();
    }
  }

  return result;
}


// ===============================
// 57．generateDay30StructureWithGPT()
// Day24〜29のデータとユーザー情報からGPT構造出力を取得
// ===============================
function generateDay30StructureWithGPT(userInfo, dayScoreMap, scoreAnalysis) {
  // Step1：Day30構造出力プロンプト生成
  const prompt = generateParsedDay30Structure(userInfo, dayScoreMap, scoreAnalysis);

  // Step2：OpenAI API 呼び出し
  const responseText = callChatGPTFromOpenAI(prompt);

  // Step3：GPT出力を構造オブジェクトにパース
  const parsed = generateParsedDay30StructureFromText(responseText); // 関数54で定義済

  return parsed; // { title, scoreSection, viewpointAnalysis, ... }
}
// ===============================
// 58．generateParsedDay30StructureFromText()
// GPT構造出力（titleやセクション）をパースしてオブジェクトに変換
// ===============================
function generateParsedDay30StructureFromText(text) {
  const sections = {
    title: "",
    scoreSection: "",
    viewpointAnalysis: "",
    thoughtStyle: "",
    gapAnalysis: "",
    valueBackground: "",
    finalMessage: ""
  };

  const patterns = {
    title: /【タイプ名】\s*(.+)/,
    scoreSection: /【Day24〜29のスコア】([\s\S]*?)(?=【|$)/,
    viewpointAnalysis: /【視点と反応の傾向】([\s\S]*?)(?=【|$)/,
    thoughtStyle: /【思考スタイル分類】([\s\S]*?)(?=【|$)/,
    gapAnalysis: /【理想と現実のギャップ】([\s\S]*?)(?=【|$)/,
    valueBackground: /【価値観形成期と背景分析】([\s\S]*?)(?=【|$)/,
    finalMessage: /【特に留意するべき点】([\s\S]*?)(?=【|$)/,
  };

  for (const key in patterns) {
    const match = text.match(patterns[key]);
    if (match) {
      sections[key] = match[1].trim();
    }
  }

  return sections;
}

// ===============================
// 59．generateDay30StructureObject()
// Day30構造出力（typeNameなど6項目）をパースして整形
// ===============================
function generateDay30StructureObject(gptText) {
  const structure = {
    typeName: "",
    typeDescription: "",
    conflictSection: "",
    shiftSection: "",
    valueFormationSection: "",
    finalMessage: ""
  };

  const patterns = {
    typeName: /typeName[:：]?\s*(.+)/i,
    typeDescription: /typeDescription[:：]?\s*(.+)/i,
    conflictSection: /conflictSection[:：]?\s*([\s\S]*?)(?=\n\S|$)/i,
    shiftSection: /shiftSection[:：]?\s*([\s\S]*?)(?=\n\S|$)/i,
    valueFormationSection: /valueFormationSection[:：]?\s*([\s\S]*?)(?=\n\S|$)/i,
    finalMessage: /finalMessage[:：]?\s*([\s\S]*?)(?=\n\S|$)/i
  };

  for (const key in patterns) {
    const match = gptText.match(patterns[key]);
    if (match) {
      structure[key] = match[1].trim();
    }
  }

  return structure;
}
// ===============================
// 60．generateDay30HtmlReport(parsed)
// Day30レポートHTMLをテンプレートから生成（変数を差し込み）
// ===============================
function generateDay30HtmlReport(parsed) {
  const template = HtmlService.createTemplateFromFile("template_day30");

  // 差し込み用変数を代入
  template.typeName = parsed.title;
  template.typeDescription = parsed.catchPhrase;
  template.scoreSection = parsed.scoreText;
  template.dominantLayer = parsed.viewpointText;
  template.thinkingType = parsed.thoughtStyleText;
  template.conflictSection = parsed.gapText;
  template.valueFormingBackground = parsed.backgroundText;
  template.finalTips = parsed.adviceText;

  // オプション：視点スコアチャート画像（base64）
  template.viewpointChartBase64 = parsed.viewpointChartBase64 || null;

  return template.evaluate().getContent();
}

// ===============================
// 61．filterNegativeExpressionsFromGptOutput(parsed)
// GPT出力の各セクションから過度な自己否定・決めつけ表現を検出し再構成
// ===============================
function filterNegativeExpressionsFromGptOutput(parsed) {
  const filters = [
    {
      pattern: /私はダメな人間です|価値がない|誰にも必要とされていない|無意味|どうせ無理/i,
      replace: "自己評価が下がっているように見えますが、その印象は感情に基づいていませんか？"
    },
    {
      pattern: /普通じゃない|変わっているだけ|異常|まともじゃない/i,
      replace: "“普通”や“変わっている”という基準は、どんな前提で使われていますか？"
    },
    {
      pattern: /誰にも見つけられてないから才能がない|評価されない＝価値がない/i,
      replace: "“見つけられていない”ことが“存在しない”とは限りません。見方を変えてみる余地がありそうです。"
    },
    {
      pattern: /もう無理だ|可能性はない|終わりだ|やっても意味がない/i,
      replace: "そのように感じるのは自然ですが、未来はまだ決定していません。他の可能性も見直せるかもしれません。"
    }
  ];

  const sectionKeys = Object.keys(parsed);

  for (const key of sectionKeys) {
    if (!parsed[key]) continue;

    let content = parsed[key];

    for (const filter of filters) {
      content = content.replace(filter.pattern, filter.replace);
    }

    parsed[key] = content;
  }

  return parsed;
}
// ===============================
// 62．generateDay30HtmlReport(parsed)
// レポートテンプレートHTMLを動的に生成
// ===============================
function generateDay30HtmlReport(parsed) {
  const template = HtmlService.createTemplateFromFile("template_day30");

  // 各セクションをテンプレートに代入
  template.title = parsed.title || "Day30レポート";
  template.scoreSection = parsed.scoreSection || "";
  template.viewpointAnalysis = parsed.viewpointAnalysis || "";
  template.thoughtStyle = parsed.thoughtStyle || "";
  template.gapAnalysis = parsed.gapAnalysis || "";
  template.valueBackground = parsed.valueBackground || "";
  template.finalMessage = parsed.finalMessage || "";

  // 🆕 レーダーチャート画像（base64）を埋め込み
  template.viewpointChartBase64 = parsed.viewpointChartBase64 || null;

  return template.evaluate().getContent();
}
// ===============================
// 60．generateDay30HtmlReport()★★
// 📄 HTMLテンプレートを取得し文字列として返す（Handlebarsで後処理）
// ===============================
function generateDay30HtmlReport() {
  try {
    const templateFile = HtmlService.createTemplateFromFile('template_day30');
    const rawHtml = templateFile.getRawContent(); // ← テンプレートファイルの中身を取得
    return rawHtml;
  } catch (e) {
    Logger.log('❌ generateDay30HtmlReport error: ' + e);
    return '';
  }
}

