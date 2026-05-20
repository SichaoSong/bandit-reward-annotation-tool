# Bandit Reward Annotation Tool

動画を見ながら、1〜7の採点と理由テキストを効率よく記録するための静的Webアノテーションツールです。

## MVP機能

- ローカル動画ファイル、ローカルフォルダー、Google Drive共有リンクから動画キューを作成
- 複数動画を読み込んだ場合、ファイル名順に整列してから固定seedでシャッフルし、同じ動画セットでは同じ提示順を再現
- WebM、MP4、MOVなどのブラウザ対応動画を読み込み
- 10秒戻る/進む、再生/停止、0.5x〜4xの再生速度変更
- 新しい動画を読み込むと現在の動画キューを置換。必要な場合は「追加」に切り替え可能
- 「今の動画をやめる」で現在の動画キューをクリア
- 作業指示を読み取り専用で常に表示
- 各動画に対して1〜7の採点
- 理由テキストは30文字以上でないと保存・次へ進行不可
- 任意メモ欄を各動画ごとに記入可能。未記入でも次へ進行可能
- 「次へ」はブラウザ内に保存して次の動画へ移動
- 「保存」はブラウザ内の結果をCSVとしてローカル保存
- 最後の動画では「完了」からCSV保存まで実行
- CSVにはランダム化後の提示順 `presentation_order` も保存
- CSV名は動画フォルダー名をベースに自動生成。例: `my_video_folder_annotations.csv`
- File System Access API対応ブラウザでは、初回保存時に作成/選択したCSVを次回以降の保存でも更新
- CSV未保存の作業結果がある状態で閉じる場合は、保存漏れ防止の確認を表示

## 使い方

`index.html` をブラウザで開きます。

1. 左側の「動画」からローカルファイル/フォルダーを選ぶか、Google Driveリンクを入力します。
2. 新しく読み込んだ動画だけで作業したい場合は「置換」、既存キューに足したい場合は「追加」を選びます。
3. 「作業指示」を必要に応じて編集します。
4. 動画を再生し、1〜7で採点します。
5. 理由を30文字以上入力します。
6. 「次へ」でブラウザ内に保存して次の動画へ進みます。
7. CSVとしてローカル保存したいタイミングで「保存」を押します。

フォルダー読み込みの場合、CSVファイル名はフォルダー名から作られます。対応ブラウザでは初回の「保存」で保存ダイアログが出ます。Downloadsを選ぶと、以後の「保存」で同じCSVが更新されます。

ブラウザの安全制約により、Webページはユーザー確認なしでDownloads内の既存ファイルを直接上書きできません。File System Access API非対応の環境では、「保存」を押した時に同名CSVをダウンロードします。CSV未保存の変更がある状態で閉じる場合は、可能な範囲でCSV保存を試みたうえで確認が出ます。

## Google Drive動画について

Google Drive動画は共有リンクを1行に1つずつ貼り付けて読み込めます。リンク先の共有設定が閲覧可能である必要があります。Drive側の制約により直接再生できない動画は、共有設定またはファイルサイズを確認してください。

Private Drive動画を読む場合は、Google CloudでOAuth Client IDを作成し、アプリ画面の「Google OAuth Client ID」に入力してログインします。

OAuth Client IDの設定では、GitHub Pagesで使うURLのoriginを Authorized JavaScript origins に追加してください。例: `https://frontieris.github.io`

ログイン経由のDrive動画は、ブラウザがDrive APIから動画ファイルを取得して再生します。大きい動画は読み込みに時間がかかるため、長時間動画や大容量動画が多い場合は、次の段階でサーバー側のストリーミングまたはCloud Storage配信を検討します。

## Web共有/デプロイ

このMVPは静的ファイルだけで動くため、GitHub Pages、Netlify、Vercelなどに置くとリンク共有できます。

GitHub Pagesで共有する場合:

1. この変更を `main` にマージします。
2. GitHub repoの Settings > Pages を開きます。
3. Sourceで GitHub Actions を選びます。
4. `Deploy static site to Pages` workflowが成功すると、次のURLでアクセスできます。

`https://frontieris.github.io/bandit-reward-annotation-tool/`

現時点の保存先は各作業者のブラウザ/CSVです。複数人の回答を中央集約したい場合は、次の段階でGoogle Sheets、Supabase、Firebase、またはバックエンドAPIへの保存を追加します。
