# 大量配信する場合の整理

このドキュメントでは、物件メールを将来的に1,000名以上へ送る場合の設計方針を整理します。

## 結論

**Google Sheets はそのまま使ってよいです。**  
ただし、**個人の無料 Gmail を大量配信エンジンとして使うのは不可**です。

大量配信では以下の役割分担にします。

```text
Google Sheets
  - 配信先リスト
  - 配信許諾
  - 停止状態
  - 物件データ
  - 配信対象セグメント

Apps Script
  - 毎日の自動実行
  - 対象抽出
  - 本文生成
  - 配信API呼び出し
  - 送信結果の記録

メール配信サービス
  - 実送信
  - SPF / DKIM / DMARC 対応
  - バウンス管理
  - 迷惑メール率管理
  - 配信停止リンク
  - 到達率管理
```

## なぜ無料 Gmail ではダメか

個人 Gmail / Apps Script では、メール受信者数の上限が非常に小さいです。  
Google Apps Script の公式クォータでは、MailApp などのメール受信者数は Consumer account で `100 / day`、Google Workspace で `1,500 / day` とされています。

公式情報:

- https://developers.google.com/apps-script/guides/services/quotas

したがって、無料 Gmail で以下のような運用は避けます。

- 1,000名へ毎日送る
- Bccに大量アドレスを入れて送る
- 複数の無料Gmailアカウントに分散して送る
- 送信制限を回避するために日をまたいで連続送信する
- 配信停止やバウンスを管理せず送る

これらは到達率低下、Gmailアカウント制限、迷惑メール扱い、法令違反リスクにつながります。

## 規模別の方針

| 規模 | 推奨構成 | 判断 |
|---:|---|---|
| 1〜20名 | Gmail + Sheets | テスト・検証向け |
| 20〜100名 | Gmail + Sheets | 無料Gmailの限界に近い。慎重に運用 |
| 100〜500名 | Workspace または配信サービス | 個人無料Gmailは不可 |
| 500〜1,000名 | 配信サービス | GmailではなくAPI配信へ移行 |
| 1,000名以上 | 配信サービス + 独自ドメイン | 本番配信基盤が必要 |
| 5,000名/日以上 | 本格的な送信者認証・解除導線・苦情率管理 | Gmail送信者要件への対応が必須 |

## 大量配信時の推奨構成

### Phase 1: 現在の無料Gmailテスト

目的は、メール本文、物件フォーマット、名簿の持ち方を検証することです。

```text
Sheets → Apps Script → Gmail
```

設定例:

```text
TEST_MODE=true
MAX_SEND_PER_RUN=20
```

### Phase 2: 小規模本番

100名未満で、全員から配信許諾が取れている場合のみ。

```text
Sheets → Apps Script → Gmail
```

ただし、個人無料Gmailでは1日100受信者程度が上限なので、長期運用には向きません。

### Phase 3: 大量配信

1,000名以上を見込む段階では、以下に移行します。

```text
Sheets → Apps Script → 配信サービスAPI → 受信者
```

候補:

- SendGrid
- Amazon SES
- Brevo
- Mailchimp
- Benchmark Email
- blastmail など

選定基準:

| 観点 | 見るべきポイント |
|---|---|
| 料金 | 月間配信数、無料枠、従量課金 |
| API | Apps Script から `UrlFetchApp` で呼べるか |
| 配信停止 | ワンクリック解除、停止リスト管理 |
| バウンス | ハードバウンス自動除外 |
| 認証 | 独自ドメインのSPF/DKIM/DMARC |
| Webhook | 配信結果をSheetsへ戻せるか |
| 日本語 | 管理画面・サポート・法令対応 |

## Google Sheets の列設計

大量配信を見込む場合、`Recipients` は以下のように拡張します。

```text
email
company
name
status
consent
source
opt_in_at
opt_in_method
unsubscribe_token
provider_contact_id
delivery_status
last_sent_at
bounce_count
last_error
note
```

### status

```text
active    = 配信対象
stopped   = 配信停止
bounced   = ハードバウンスなどで停止
pending   = 承諾未確認
blocked   = 手動除外
```

### consent

```text
yes = 送信許諾あり
no  = 送信許諾なし
```

### opt_in_method 例

```text
manual_import
business_card
website_form
existing_client
ml_permission
```

## 配信停止の考え方

大量配信では、本文末尾に「返信で停止」だけでは弱いです。  
最低でも以下を管理します。

- 停止希望者を即日 `status=stopped` にする
- 停止者には再送しない
- 停止理由や停止日時を記録する
- 可能なら配信サービスの解除リンクを使う
- 将来的には独自の解除フォームを用意する

## バウンス管理

大量配信では、存在しないメールアドレスへ送り続けると到達率が落ちます。

運用ルール例:

```text
ハードバウンス1回 → status=bounced
ソフトバウンス3回 → status=bounced または確認待ち
苦情・迷惑メール報告 → 即 stopped / blocked
```

配信サービスのWebhookを使える場合は、以下をSheetsへ反映します。

```text
delivered
opened
clicked
bounced
complained
unsubscribed
```

## 独自ドメイン認証

1,000名以上へ本番配信する場合は、Gmailアドレスのまま送るのではなく、独自ドメインを使うことを推奨します。

例:

```text
info@example-realestate.jp
news@example-realestate.jp
```

設定すべき認証:

- SPF
- DKIM
- DMARC

Google は Gmail 宛て送信者に対して、送信者認証、迷惑メール率の低さ、登録解除対応などの要件を示しています。

公式情報:

- https://support.google.com/a/answer/81126

## Apps Script から配信APIへ切り替える設計

現在の `MailApp.sendEmail()` を、将来的には以下のような関数へ差し替えます。

```javascript
function sendWithProvider_(recipient, subject, htmlBody, plainBody, config) {
  const payload = {
    to: recipient.email,
    name: recipient.name,
    subject: subject,
    html: htmlBody,
    text: plainBody
  };

  const response = UrlFetchApp.fetch(config.PROVIDER_API_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${config.PROVIDER_API_KEY}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`Provider API error: ${code} ${response.getContentText()}`);
  }

  return response.getContentText();
}
```

実装方針:

1. `Config` に `SEND_PROVIDER` を追加
2. `SEND_PROVIDER=gmail` の場合は `MailApp.sendEmail()`
3. `SEND_PROVIDER=api` の場合は `UrlFetchApp.fetch()`
4. APIレスポンスを `SendLog` に記録
5. 配信サービスのWebhookで `bounced` / `unsubscribed` を反映

## 配信サービス別メモ

### Amazon SES

- 低コスト寄り
- 独自ドメイン認証が前提
- 最初はサンドボックス制限あり
- 本番利用にはproduction accessが必要
- 24時間クォータと送信レートで制御される

公式情報:

- https://docs.aws.amazon.com/ses/latest/dg/quotas.html
- https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas.html

### Brevo

- APIでトランザクションメール送信が可能
- Batch送信機能あり
- Webhookでイベント連携可能

公式情報:

- https://developers.brevo.com/reference/send-transac-email
- https://developers.brevo.com/docs/batch-send-transactional-emails

### SendGrid

- メール配信APIの定番
- 独自ドメイン認証、テンプレート、イベントWebhookなどを使える
- 無料枠や料金は変わるため、導入時に公式料金ページで確認

公式情報:

- https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send

## 大量配信でやってはいけないこと

- 承諾なしリストへ送る
- Bccで一斉送信する
- 停止依頼を無視する
- 反応がない古いリストに送り続ける
- Gmailアカウントを複数作って制限回避する
- Gmail送信元のまま1,000名以上に営業配信する
- バウンス率や迷惑メール報告率を見ない

## 最終形

大量配信の最終形は以下です。

```text
Google Sheets
  ↓
Apps Script scheduled trigger
  ↓
Segment active + consent=yes recipients
  ↓
Generate property digest HTML
  ↓
Email provider API
  ↓
Webhook
  ↓
Update Sheets: delivered / bounced / unsubscribed / complained
```

このリポジトリでは、まず `Sheets + Apps Script` の管理設計を固めます。  
送信数が増えてきた段階で、送信関数だけ配信サービスAPIに差し替える想定です。
