# Google Groupsで無料配信する実装

## 目的

個人無料Gmailから1,000人へ直接送らず、Google Groupsの1つのグループアドレスに送ります。

```text
Google Sheets
  ↓
Apps Script
  ↓
property-list@googlegroups.com
  ↓
Google Groupsがメンバーへ配信
```

## 実装する安全ルール

| ルール | 実装方法 |
|---|---|
| 配信許可がある相手だけ入れる | `Recipients` の `status=active` かつ `consent=yes` だけを `GroupImport` に出力 |
| 停止希望が来たらすぐ外す | `status=stopped` に変更し、`GroupRemoval` に出力してGroupsから手動削除 |
| 投稿できるのは自分だけ | Google GroupsのPosting policiesで手動設定 |
| メンバー一覧を公開しない | Google GroupsのPrivacy/Permissionsで手動設定 |
| 返信が全員に飛ばないようにする | Google GroupsのEmail options / Reply設定で手動設定 |
| 最初は100名でテスト | `GROUP_EXPORT_LIMIT=100` で出力件数を制限 |

## 個人無料アカウントで自動化できない部分

Google Groupsの作成、投稿権限、メンバー一覧の公開範囲、返信先設定、メンバー削除は、個人無料Googleアカウントでは画面で設定します。

Google Workspace管理者ならAdmin SDKやGroups Settings APIで自動化できますが、個人無料アカウントではこのリポジトリは手動設定前提です。

## Google Groups側の設定

Google Groupsでグループを作成します。

例:

```text
property-list@googlegroups.com
```

推奨設定:

```text
Who can post: Group owners / managers only
Who can view conversations: Group members only
Who can view members: Group owners / managers only
Who can join group: Invited users only
Who can manage members: Group owners / managers only
Reply to: Sender / Owner / Managers
Message moderation: 必要ならON
```

## Google Sheets Config

`Config` に以下を追加します。

```csv
key,value
GROUP_EMAIL,property-list@googlegroups.com
GROUP_TEST_EMAIL,your-address@gmail.com
GROUP_SEND_DAYS,MON,WED,FRI
GROUP_TRIGGER_HOUR,8
GROUP_DRY_RUN,true
GROUP_EXPORT_LIMIT,100
```

最初は必ず以下にします。

```text
TEST_MODE=true
GROUP_DRY_RUN=true
GROUP_EXPORT_LIMIT=100
```

## Recipients

```csv
email,company,name,status,consent,last_sent_at,bounce_count,note
agent@example.com,○○不動産,田中,active,yes,,0,
stop@example.com,△△不動産,佐藤,stopped,yes,,0,停止希望
pending@example.com,□□不動産,鈴木,active,no,,0,未承諾
```

Groupsに入れてよいのは以下だけです。

```text
status=active
consent=yes
```

## 実行順

### 1. 許可済み100件を出力

Apps Scriptで実行:

```text
exportEligibleRecipientsForGoogleGroup
```

`GroupImport` シートに100件まで出ます。これをGoogle GroupsのMembers画面から追加します。

### 2. 停止者を出力

停止希望が来たら、`Recipients.status` を `stopped` にします。

Apps Scriptで実行:

```text
exportStoppedRecipientsForGoogleGroupRemoval
```

`GroupRemoval` に出たメールアドレスをGoogle Groupsから削除します。

### 3. 下書きテスト

`Listings` に物件を入れます。

Config:

```text
TEST_MODE=true
GROUP_DRY_RUN=true
```

Apps Scriptで実行:

```text
sendToGoogleGroup
```

`SendLog` に送信予定だけが記録されます。メールは送られません。

### 4. 自分宛てテスト

Config:

```text
TEST_MODE=true
GROUP_DRY_RUN=false
GROUP_TEST_EMAIL=自分のメール
```

Apps Scriptで実行:

```text
sendToGoogleGroup
```

### 5. グループ宛て本番テスト

Config:

```text
TEST_MODE=false
GROUP_DRY_RUN=false
GROUP_EMAIL=property-list@googlegroups.com
```

最初は100名だけ入れたグループで実行します。

### 6. 週3トリガー作成

問題なければ実行:

```text
createWeeklyGoogleGroupTriggers
```

デフォルトは月水金8時です。

## 注意

Google Groupsはメール配信サービスではありません。到達率、バウンス、迷惑メール報告、ワンクリック解除を本格管理したい場合は、SenderやBrevoなどのメール配信サービスへ移行してください。
