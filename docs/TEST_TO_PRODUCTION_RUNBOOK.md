# テスト送信から本番実行までの手順

## 前提

このリポジトリだけでは実メール送信は完了しません。Gmail 送信と Apps Script の権限承認は、Google アカウントに紐づく Google Sheets / Apps Script 画面上で実行する必要があります。

送信テスト用のメールアドレスは、公開リポジトリに直書きせず、Google Sheets の `Config` シートだけに設定してください。

## 1. Google Sheets を作成する

新しい Google Sheets を作成し、以下のシートを用意します。

- `Config`
- `Recipients`
- `Listings`
- `SendLog`

`samples/Config.csv`、`samples/Recipients.csv`、`samples/Listings.csv` を参考に、各シートへヘッダーとサンプルデータを入れます。

## 2. Config をテスト用に設定する

`Config` シートに以下を設定します。

| key | value |
| --- | --- |
| SENDER_NAME | 物件配信 |
| REPLY_TO | 返信を受けたい Gmail アドレス |
| TEST_MODE | true |
| TEST_EMAIL | 送信テスト用アドレス |
| MAX_SEND_PER_RUN | 20 |
| UNSUBSCRIBE_TEXT | 配信停止をご希望の場合は、このメールに返信してください。 |

重要:

- `TEST_MODE=true` の間は、実際の `Recipients` ではなく `TEST_EMAIL` のみに送られます。
- 個人情報保護のため、テスト用メールアドレスは公開 GitHub にはコミットしないでください。

## 3. Recipients を用意する

テスト段階でも、最低 1 行は送信対象になる宛先を入れてください。

送信対象条件:

- `email` が空ではない
- `status` が `active`
- `consent` が `yes`

例:

| email | company | name | status | consent | last_sent_at | bounce_count | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| test@example.com | テスト会社 | テスト担当 | active | yes |  | 0 | テスト用 |

## 4. Listings を用意する

最低 1 件、`status` が空欄の物件を入れてください。

掲載対象条件:

- `title` が空ではない
- `status` が空欄

例:

| id | title | price | area | layout | station | url | comment | status | sent_at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 001 | テスト物件 | 4,980万円 | 渋谷区 | 2LDK | 渋谷徒歩8分 | https://example.com | テスト配信用 |  |  |

## 5. Apps Script にコードを貼り付ける

1. Google Sheets で `拡張機能 > Apps Script` を開きます。
2. `src/Code.js` の内容を貼り付けます。
3. Google Groups モードも使う場合は、`src/GoogleGroupsMode.js` の内容も同じ Apps Script プロジェクトに追加します。
4. `appsscript.json` の内容を Apps Script のマニフェストに反映します。
5. 保存します。

## 6. テスト送信を実行する

Apps Script エディタで `sendDailyPropertyMail` を選択し、手動実行します。

初回実行時は Google の権限承認が表示されます。内容を確認し、送信元として利用する Google アカウントで承認してください。

確認ポイント:

- テスト用アドレスに `[TEST]` 付きのメールが届いたか
- 件名の日付と物件数が正しいか
- HTML 本文とテキスト本文が読めるか
- 配信停止文が入っているか
- `SendLog` に `TEST_SENT` が記録されたか
- `TEST_MODE=true` のため、実宛先には送られていないか

## 7. 本番前チェック

本番に切り替える前に、以下を確認します。

- 宛先は配信許可を得た相手だけか
- `Recipients.status` と `Recipients.consent` が正しいか
- 配信停止依頼の運用方法が決まっているか
- `UNSUBSCRIBE_TEXT` が本文に入っているか
- `MAX_SEND_PER_RUN` が小さい値から始まっているか
- 送信ログ確認担当が決まっているか
- 大量配信ではなく少量配信であることを確認したか

## 8. 本番実行する

`Config` シートを以下のように変更します。

| key | value |
| --- | --- |
| TEST_MODE | false |
| MAX_SEND_PER_RUN | 20 など小さい値 |

その後、Apps Script エディタで `sendDailyPropertyMail` を手動実行します。

初回本番送信後は必ず確認してください。

- `SendLog` に `SENT` が記録されたか
- 送信件数が想定内か
- `Listings.sent_at` が更新されたか
- `Recipients.last_sent_at` が更新されたか
- 受信者からエラー・停止依頼が来ていないか

## 9. 日次トリガーを作る

手動実行で問題がなければ、Apps Script エディタで `createDailyTrigger` を 1 回だけ実行します。

これで `sendDailyPropertyMail` が毎日 8 時台に実行されます。

トリガーを止める場合は `deleteAllTriggers` を実行します。

## 10. Google Groups モードでテストする場合

`Config` に以下も追加します。

| key | value |
| --- | --- |
| GROUP_EMAIL | 本番用 Google Group アドレス |
| GROUP_TEST_EMAIL | テスト用メールアドレス |
| GROUP_SEND_DAYS | MON,WED,FRI |
| GROUP_TRIGGER_HOUR | 8 |
| GROUP_DRY_RUN | true |
| GROUP_EXPORT_LIMIT | 100 |

手順:

1. `GROUP_DRY_RUN=true` で `sendToGoogleGroup` を実行する。
2. `SendLog` に `GROUP_DRY_RUN` が記録されることを確認する。
3. 問題なければ `GROUP_DRY_RUN=false` にする。
4. `TEST_MODE=true` のまま `sendToGoogleGroup` を手動実行し、`GROUP_TEST_EMAIL` または `TEST_EMAIL` へ届くことを確認する。
5. 本番は `TEST_MODE=false` にして実行する。
6. 定期配信する場合は `createWeeklyGoogleGroupTriggers` を 1 回だけ実行する。

## できないこと / 手動で必要なこと

- このリポジトリから直接 Gmail 送信テストを実行することはできません。
- Apps Script の権限承認は Google アカウントの画面で手動実行が必要です。
- テスト用メールアドレス、返信先、本番グループアドレスは公開 GitHub ではなく、Google Sheets の `Config` に設定してください。
- 大量配信・営業メールでは、法令、Google の利用規約、配信停止対応、到達率対策を必ず確認してください。
