# 呪術廻戦データベース

既存の呪術サイトを、画面・操作・データの形を保ってGitHubで管理するための移行用ソースです。
基準はSitesのバージョン30、コミット `9b55f8d9b1f0579c7546147453faba65b53b1561` です。

## 今回の移行範囲

- 画面、CSS、文章、検索、カテゴリ、詳細、見開き、表示順の操作を保持します。
- 表紙、人物画像、LINEスタンプは既存のファイルと外部リンクを保持します。
- 本編のページ画像6,260枚は、ファイルにもGit履歴にも含めません。
- `data/drive/page-ids.json` に、ページ番号とDriveファイルIDの対応6,260件を保持します。
- 本編画像の公開共有と表示リンクの変更は、利用者の指示により最後に行います。

## GitHub Pages対応

`npm run build` は `/J/` 配下で動く静的サイトを `dist/` に生成します。
既存の画面、CSS、検索、並び順、詳細、見開き、LINEスタンプ一覧を使用します。
本編の論理パスは表示時に `data/drive/page-ids.json` からDrive画像URLへ変換します。
表紙・人物用の同梱画像・LINE画像はGitHub Pagesから配信します。

**Drive画像の共有設定と、公開後の画像実表示の確認は未完了です。**
Drive画像は「リンクを知っている全員・閲覧者」で読める状態にする必要があります。
コード上の全6,260件の対応検証と、外部配信による実表示確認は別の検証です。
元サイトとDriveの共有設定は、このソースの変更によって自動変更されません。

公開先の予定: `https://3fes3fes-droid.github.io/J/`
GitHubのSettings → Pages → SourceはGitHub Actionsを選択します。
`.github/workflows/deploy-pages.yml` が検証・ビルド・公開を行います。

ローカルで公開成果物を確認する場合は `npm run preview:pages` を実行し、`/J/` を開きます。
開発時は `npm run dev:pages` を使用します。

## 構成

| パス | 内容 |
| --- | --- |
| `app/` | 現行の画面、操作、CSS |
| `data/raw/` | カテゴリ別の編集元データ |
| `public/data/` | 画面が読むデータと全ページ検索索引 |
| `public/media/covers/` | 表紙31枚 |
| `public/media/character-scenes/` | 人物用の既存画像 |
| `public/external/` | LINEスタンプ一覧と280画像 |
| `data/drive/page-ids.json` | 本編ページとDriveファイルIDの対応 |
| `worker/` | 現行の配信処理。画像連携は最後に変更 |
| `migration/source-baseline.json` | 保持対象ファイルの移行前SHA-256 |

## ローカル確認

Node.js 22.13以上、Linux、GNU timeoutが必要です。依存関係は既存のロックファイルを使用します。

```sh
npm ci
npm run test:data
npm test
npm run verify:migration
```

`npm test` はデータ生成、Pages用ビルド、データ整合性、全ページのDrive対応、配信パスと静的成果物を検証します。
移行元のWorker構成の検証は `npm run test:legacy` に残しています。
ページ画像のテストはファイルの同梱ではなく、検索索引とDrive対応表の一致を検証します。
このテストの成功はDrive画像の実表示成功を意味しません。

`verify:migration` は画面・CSS・データ・保持画像のハッシュ、全6,260件の対応、本編画像の混入、
100 MiB以上のファイルを確認します。Git初期化後は登録対象と履歴も確認します。
この基準は今回の移行確認用です。将来の意図した画面・データ変更時には、差分を確認して基準を更新してください。

## GitHub登録

作り直したリポジトリ `3fes3fes-droid/J` へ、新しい履歴で登録します。移行元Sitesおよび旧Jの履歴は引き継ぎません。
すべての新規コミットではauthorとcommitterの両方にGitHubのnoreplyアドレスを明示します。
本編画像、認証情報、依存関係、ビルド生成物は登録しません。

移行元のVinext/Cloudflare Workerファイルは参照用として保持し、Pages用ビルドでは読み込みません。
GitHubへのソース登録と、サイトの配信先の切り替えは別の工程です。
本編画像のリンクを作り直して表示を確認するまで、現在の配信先を切り替えません。
