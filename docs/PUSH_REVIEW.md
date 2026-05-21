# Push Review

## この PR で追加したもの

- `docs/architecture.svg`
  - リポジトリ、Google Sheets、Apps Script、Gmail / Google Groups、テストから本番までの全体像を示す日本語のアーキテクチャ画像です。
- `docs/ARCHITECTURE.md`
  - アーキテクチャ画像の説明と、各コンポーネントの役割をまとめています。
- `docs/TEST_TO_PRODUCTION_RUNBOOK.md`
  - テスト送信から本番実行までの手順書です。

## レビュー観点

- 無料 Gmail / Apps Script での少量配信を前提にしていることが明確か
- `TEST_MODE=true` でテスト送信を先に行う流れになっているか
- 個人情報やテスト用メールアドレスを公開リポジトリへ直書きしていないか
- 大量配信では外部配信サービスを推奨する記載になっているか
- 配信許可、配信停止、ログ確認の運用が明記されているか

## 実行確認について

この PR では GitHub 上のドキュメントと画像を追加しています。

実際の Gmail 送信テストは、Google Sheets と Apps Script を紐づけたうえで、送信元 Google アカウントから手動実行してください。
