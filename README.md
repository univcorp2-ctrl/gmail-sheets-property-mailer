# Gmail Sheets Property Mailer

Google Sheets + Google Apps Script で、物件情報をメール配信するための最小構成です。

## 重要

このリポジトリは、**個人の無料 Gmail で大量配信するためのものではありません**。

個人 Gmail / 無料 Apps Script では送信可能数が小さいため、1,000名以上への毎日配信には向きません。  
このコードでは安全のため、デフォルトで1回あたりの送信上限を `MAX_SEND_PER_RUN` で制限しています。

1,000名以上へ本番配信する場合は、SendGrid、Amazon SES、Mailchimp、Brevo などのメール配信サービスを使う構成に移行してください。

## できること

- Google Sheets で配信先リストを管理
- Google Sheets で物件リストを管理
- `active` かつ `consent=yes` の宛先だけに送信
- `stopped` / `bounced` の宛先を除外
- 未送信物件だけをメール本文に掲載
- 送信ログを `SendLog` シートに記録
- テスト送信モードあり
- 1回あたり送信数の上限あり

## シート構成

### Config

| key | value |
|---|---|
| SENDER_NAME | 物件配信 |
| REPLY_TO | your-address@gmail.com |
| TEST_MODE | true |
| TEST_EMAIL | your-address@gmail.com |
| MAX_SEND_PER_RUN | 20 |
| UNSUBSCRIBE_TEXT | 配信停止をご希望の場合は、このメールに返信してください。 |

`TEST_MODE=true` の間は、実際の宛先ではなく `TEST_EMAIL` のみに送ります。

### Recipients

| email | company | name | status | consent | last_sent_at | bounce_count | note |
|---|---|---|---|---|---|---|---|
| agent@example.com | ○○不動産 | 田中 | active | yes |  | 0 |  |

送信対象になる条件:

- `email` が入っている
- `status` が `active`
- `consent` が `yes`

### Listings

| id | title | price | area | layout | station | url | comment | status | sent_at |
|---|---|---|---|---|---|---|---|---|---|
| 001 | ○○マンション | 4,980万円 | 渋谷区 | 2LDK | 渋谷徒歩8分 | https://example.com | 新着 |  |  |

メール掲載対象になる条件:

- `title` が入っている
- `status` が空欄

## 導入手順

1. Google Sheets を新規作成
2. `Config`, `Recipients`, `Listings` の3シートを作成
3. `samples/*.csv` を参考に各シートへヘッダーを入れる
4. Google Sheets の `拡張機能 > Apps Script` を開く
5. `src/Code.js` の内容を貼り付ける
6. `sendDailyPropertyMail` を手動実行して権限許可
7. まずは `TEST_MODE=true` で自分宛てにテスト
8. 問題なければ `TEST_MODE=false` に変更
9. `createDailyTrigger` を1回だけ実行

## 無料 Gmail でのおすすめ運用

無料で始めるなら、最初は以下のようにしてください。

- `MAX_SEND_PER_RUN=20` など小さく始める
- いきなり1,000名へ送らない
- 配信許可がある相手だけに送る
- 配信停止依頼が来たら `status=stopped` にする
- 本文に配信停止方法を必ず入れる
- BCC一括送信は使わない

## ファイル構成

```text
.
├── README.md
├── appsscript.json
├── src/
│   └── Code.js
└── samples/
    ├── Config.csv
    ├── Recipients.csv
    └── Listings.csv
```

## 注意

このコードは、少量配信・テスト配信・業務フロー検証用です。広告宣伝メールを送る場合は、事前承諾、送信者情報、配信停止手段などの法令対応を必ず行ってください。
