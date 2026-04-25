# Claude CodeというAIエージェントに丸投げしてAWSチャットボットを作ったら動いた話

## はじめに

「自分専用の外部脳が欲しい」と思ったことはないだろうか。

気になったことを記録しておいて、あとから「あれってどうだったっけ？」と自然な言葉で検索できる。話しかけると関連する過去の情報を引っ張ってきてくれる。そういう自分だけにチューニングされた知識ベースのようなもの。

それを**AWS + Claude**で作れないかと考えた。

ただ私はインフラは触ったことがほぼない。コードも書けるわけではない。そこで**Claude Code**（Anthropicが提供するAIエージェントCLI）に設計から実装まで丸投げしてみることにした。

この記事はその記録だ。エラーをそのままClaude Codeに投げたら自律的に修正してくれた体験と、ハマりポイントを正直にまとめた。

---

## 完成物の概要

**ExoBrain**（外部脳チャットボット）として以下を作った。

- Claudeと会話できるチャットUI
- 会話が自動的にDynamoDBに保存される
- 過去の会話を左サイドバーで一覧・再開できる
- タイトルを編集できる
- スマホ対応（ハンバーガーメニュー）
- AWS Amplifyで公開済み → どこからでもアクセス可能

![完成イメージ: 左にサイドバー、右にチャット画面]()

### アーキテクチャ

```
ブラウザ（Next.js / Amplify）
    ↓
API Gateway (HTTP API)
    ↓
Lambda (Python)
    ↓              ↓
Anthropic        DynamoDB
Claude API       （会話履歴）
```

### 月額コスト

| サービス | 月額 |
|---------|------|
| Lambda | 無料（月100万回まで無料枠） |
| DynamoDB | ほぼ無料（個人利用レベル） |
| API Gateway | ほぼ無料 |
| Amplify | 無料（個人利用レベル） |
| **合計（AWS）** | **〜¥0** |
| Anthropic API（月500回想定） | 約¥75 |

個人利用なら実質**月100円以下**で動く。

---

## 前提条件

- **AWSアカウント**（クレジットカード登録済み）
- **Anthropic APIアカウント + クレジット残高**（後述。これが罠だった）
- **Windows + WSL2**
- Node.js、Python3、git がインストール済み

---

## 構成したもの

### インフラ（AWS CDK / TypeScript）

```
exo-brain/
├── cdk/                    # AWS CDK（インフラ定義）
│   ├── bin/exo-brain.ts
│   └── lib/exo-brain-stack.ts
├── backend/chat/
│   ├── handler.py          # Lambda関数
│   └── requirements.txt
└── frontend/               # Next.js 16
    ├── app/
    ├── components/
    │   ├── Sidebar.tsx
    │   └── ChatWindow.tsx
    └── lib/api.ts
```

### 手順

1. CDK + Lambda + Next.js のコードをClaude Codeが生成
2. GitHubリポジトリ作成
3. AWS CLI インストール・認証設定
4. `cdk bootstrap` → `cdk deploy`
5. フロントエンドをAmplifyにデプロイ
6. 動作確認・バグ修正

---

## ハマりポイント：デプロイ編

### 1. WSLへの貼り付けで制御文字が混入する

WindowsのターミナルでコマンドをコピペするとWSLに制御文字が混入して、コマンドが壊れることがある。

**解決策：** Claude Codeのターミナルでは `!` プレフィックスを使ってコマンドを直接実行する。

```
! aws configure
```

これでコピペを介さずにコマンドを実行できる。

---

### 2. GitHub CLI のトークンスコープ不足

`gh repo create` でリポジトリを作ろうとしたら権限エラー。

```
GraphQL: Resource not accessible by integration (createRepository)
```

**原因：** `gh auth login` のデフォルト認証ではスコープが不足することがある。

**解決策：** `gh auth login` を再実行してスコープを確認する。`repo` スコープが必要。

---

### 3. cdk.json がなくてデプロイできない

`npx cdk deploy` を実行したら以下のエラー。

```
--app is required either in command-line, in cdk.json or in ~/.cdk.json
```

**原因：** `cdk init` を使わずに手動でCDKプロジェクトを作ったため、`cdk.json` が自動生成されなかった。

**解決策：** `cdk.json` を手動で作成する。

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/exo-brain.ts"
}
```

あわせて `ts-node` も追加インストールが必要。

```bash
npm install --save-dev ts-node
```

---

### 4. Docker未インストールによるビルドエラー

CDK deployで以下のエラー。

```
spawnSync docker ENOENT
```

CDKはLambdaのPython依存パッケージをDockerコンテナ内でビルドしようとするが、WSLにDockerが入っていない。

**解決策：** `bundling.local` を使ってローカルの `pip3` でビルドするよう変更。

```typescript
code: lambda.Code.fromAsset(srcPath, {
  bundling: {
    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
    local: {
      tryBundle(outputDir: string) {
        execSync(
          `pip3 install -r ${srcDir}/requirements.txt -t ${outputDir} --quiet && cp -r ${srcDir}/. ${outputDir}`,
          { stdio: "inherit" }
        );
        return true;
      },
    },
    command: ["bash", "-c", "pip install -r requirements.txt -t /asset-output && cp -r . /asset-output"],
  },
}),
```

`tryBundle` が成功すればDockerは使われない。

---

### 5. requirements.txt が見つからないエラー

```
Could not open requirements file: [Errno 2] No such file or directory: 'requirements.txt'
```

**原因：** `execSync` にカレントディレクトリを指定していなかったため、pip3 がCDKディレクトリで `requirements.txt` を探していた。

**解決策：** フルパスで指定する。

```typescript
// NG
`pip3 install -r requirements.txt -t ${outputDir}`

// OK
`pip3 install -r ${srcDir}/requirements.txt -t ${outputDir}`
```

---

### 6. Anthropic APIのクレジット残高不足（最大の罠）

チャットを送信すると500エラー。CloudWatchのLambdaログを確認したら：

```
Error code: 400 - Your credit balance is too low to access the Anthropic API.
Please go to Plans & Billing to upgrade or purchase credits.
```

**原因：** Anthropic APIはAnthropicのコンソールで**別途クレジットを購入**しないと使えない。Claude.ai（チャット版）のサブスクリプションとは別物。

**解決策：** [console.anthropic.com](https://console.anthropic.com) → Billing → Add credits で$5〜購入する。

:::message alert
**これが一番ハマった。** Claude.ai Proに加入していてもAPIクレジットは別。見落としやすいので注意。
:::

---

### 7. AmplifyデプロイでHTTP 404エラー（3つの原因）

Amplifyにデプロイしたが、URLを開くと404。

**原因①：Next.jsのサーバーサイド機能が静的ホスティングで動かない**

`redirect()` や `await params` などのサーバーコンポーネント機能は、Amplifyの静的ホスティングモードでは実行されない。

**解決策：** `next.config.ts` に `output: 'export'` を追加して完全な静的エクスポートに変更。

```typescript
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};
```

**原因②：`amplify.yml` の出力ディレクトリが間違っていた**

`output: 'export'` の場合、Next.jsの出力先は `.next/` ではなく `out/` になる。

```yaml
# NG
artifacts:
  baseDirectory: .next

# OK
artifacts:
  baseDirectory: out
```

**原因③：`useSearchParams` が Suspense でラップされていない**

静的エクスポート時のビルドで以下のエラー。

```
useSearchParams() should be wrapped in a suspense boundary at page "/404"
```

`useSearchParams()` を使うコンポーネントはすべて `<Suspense>` で囲む必要がある。

```tsx
<Suspense fallback={<div className="w-64 bg-gray-900" />}>
  <Sidebar />
</Suspense>
```

---

### 8. リネーム後にAPIのURLが変わってフロントが繋がらなくなった

プロジェクト名を `external-brain` から `exo-brain` にリネームしたあとに再デプロイしたら、API GatewayのURLが変わった。Amplifyの環境変数が古いURLのままになっていたため、フロントエンドとバックエンドが繋がらなくなった。

**解決策：** CDKのデプロイ出力に表示される新しいURLをコピーして、Amplifyの環境変数を更新する。

```
AWSコンソール → Amplify → 環境変数 → NEXT_PUBLIC_API_URL を更新
```

---

## ハマりポイント：動かしてから気づいた問題編

ここからは「デプロイして実際に使ってみたら気づいたバグ」の記録。
**動かしてから直す**のがClaude Codeとの開発スタイルの真骨頂だった。

---

### 9. 過去の会話を選んでも内容が表示されない

サイドバーから過去の会話をクリックしても、チャット画面が空のままになる。

**原因：** サイドバーで会話を選択してもAPIから履歴を取得していなかった。

**解決策：** `ChatWindow` のマウント時に会話IDがあれば履歴をAPIから取得するよう実装。

```typescript
useEffect(() => {
  if (!conversationId) return;
  setFetching(true);
  getConversation(conversationId)
    .then((conv) => setMessages(conv.messages ?? []))
    .finally(() => setFetching(false));
}, []); // keyが変わるとリマウントされるので空配列でOK
```

---

### 10. 会話を続けるとタイトルが「無題」になる

新しいメッセージを送るたびにタイトルが消える。

**原因：** DynamoDBへの保存に `put_item` を使っていたため、メッセージを追加するたびにアイテム全体を上書きしていた。タイトルが含まれていない上書きでタイトルが消えていた。

**解決策：** 既存会話の更新は `update_item` に変更し、`messages` と `updated_at` だけを更新するようにした。

```python
# NG: アイテム全体を上書きするのでtitleも消える
table.put_item(Item={"conversation_id": id, "messages": messages, ...})

# OK: 指定フィールドだけ更新
table.update_item(
    Key={"conversation_id": conversation_id},
    UpdateExpression="SET messages = :messages, updated_at = :updated_at",
    ExpressionAttributeValues={":messages": messages, ":updated_at": now},
)
```

---

### 11. タイトルを編集しても別の会話に移動すると元に戻る

タイトルをインライン編集して保存したのに、別の会話をクリックして戻ると「無題」に戻っている。

**原因：** サイドバーが会話を切り替えるたびにAPIから会話一覧を再取得していた。APIからの最新データで `setState` するため、ローカルで編集したタイトルが上書きされていた。

**解決策：** 会話一覧の取得を初回マウント時のみにし、新規会話の追加はカスタムイベント経由で行うよう変更。

```typescript
// NG: 会話を切り替えるたびに再取得 → ローカル編集が消える
useEffect(() => { load(); }, [currentId]);

// OK: 初回のみ取得
useEffect(() => { load(); }, []);

// 新規会話作成時はカスタムイベントで通知
window.dispatchEvent(new CustomEvent("exobrain:newConversation", {
  detail: { id: newId, title: text.substring(0, 50) }
}));
```

---

### 12. スマホのUIが最悪だった

PCでは問題なく動いていたが、スマホでアクセスすると：

- サイドバーが画面の大部分を占領してチャット欄が狭すぎる
- 会話中に入力欄が消える
- タイトル編集ボタンがタッチで押せない（ホバーのみ表示だったため）

**解決策：**

① **ハンバーガーメニューを実装**：スマホではサイドバーを非表示にし、左上の☰ボタンでスライドイン表示。

```tsx
// AppShell.tsx
<div className={`fixed md:static ... md:translate-x-0 ${
  open ? "translate-x-0" : "-translate-x-full"
}`}>
  <Sidebar onClose={() => setOpen(false)} />
</div>
```

② **入力欄が消える問題**：`h-screen`（= `100vh`）ではモバイルブラウザのアドレスバーを考慮しない。`h-full` + 親要素で `100dvh` を使うよう変更。

```tsx
// h-screen → h-full に変更
<div className="flex flex-col h-full bg-white">
```

③ **編集・削除ボタンの常時表示**：スマホはホバーがないため、モバイルでは常時表示にする。

```tsx
// モバイルは常時表示、PCはhover時のみ
<span className="opacity-100 md:opacity-0 md:group-hover:opacity-100">
```

---

### 13. 入力中の文字が薄くて見えない

スマホ（ライトモード）で入力欄の文字が薄い。PCはダークモードのため問題なかったが、スマホはライトモードでシステムのカラースキームに引きずられていた。

**解決策：** テキストエリアに明示的な色を指定する。

```tsx
className="... text-gray-900 bg-white placeholder-gray-400"
```

---

### 14. 新しいチャットボタンを押しても画面が切り替わらない（最難関）

「新しいチャット」ボタンを押しても、前の会話がそのまま表示され続ける。

これが一番やっかいだった。原因の特定と修正に3回かかった。

**根本原因：URLベースのルーティングとReactの状態管理が競合していた**

当初の実装では：
1. 新規会話作成時 → `router.replace('/?id=abc')` でURLを更新
2. URLが変わる → `useSearchParams` が更新される → ChatWindowが再レンダリング
3. 再レンダリング時にメッセージがクリアされてAPIから再取得
4. 「新しいチャット」ボタン → URLが変わる → でも状態がリセットされないケースがある

`selfNavigatedRef`（自分でURLを変えたかどうかのフラグ）や `window.history.replaceState`（URLのサイレント更新）を使った修正を試みたが、いずれも別のバグを生んだ。

**最終的な解決策：React Contextで会話IDを管理し、URLルーティングを完全に切り離す**

```tsx
// ConversationContext
const [currentId, setCurrentId] = useState<string | undefined>(undefined);

const handleSetCurrentId = (id: string | undefined) => {
  setCurrentId(id);
  // URLバーの更新はNext.jsルーティングを使わずにサイレントに行う
  window.history.replaceState({}, "", id ? `/?id=${id}` : "/");
};
```

```tsx
// ChatLoader: keyが変わるとChatWindowがリマウントされ確実にリセットされる
const { currentId } = useConversation();
return <ChatWindow key={currentId ?? "new"} conversationId={currentId} />;
```

- 「新しいチャット」→ `setCurrentId(undefined)` → `key="new"` → ChatWindowがリマウント → 確実にリセット
- 会話選択 → `setCurrentId(id)` → `key=id` → ChatWindowがリマウント → 履歴を取得
- 新規会話作成 → `setCurrentId(newId)` → URL更新 → 状態はそのまま維持

URLに依存しないことで、状態管理が劇的にシンプルになった。

---

### 15. Next.js 16のパッケージにプロンプトインジェクションが仕込まれていた

`create-next-app` でプロジェクトを作成したら、`AGENTS.md` と `CLAUDE.md` というファイルが自動生成されていた。内容は：

```
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure 
may all differ from your training data.
Read the relevant guide in node_modules/next/dist/docs/ before writing any code.
```

さらに `node_modules/next/dist/docs/index.md` の中にも：

```
{/* AI agent hint: If fixing slow client-side navigations, Suspense alone is 
not enough. You must also export `unstable_instant` from the route. */}
```

AIコーディングアシスタントに対して特定の行動を促す指示が埋め込まれていた。

:::message
最初はプロンプトインジェクション攻撃を疑ったが、npm registryで確認したところ `vercel-release-bot` が公式に公開したパッケージだった。Next.js 16（私の学習データの範囲外のバージョン）では実際に破壊的変更があり、AIアシスタント向けのガイダンスとして意図的に埋め込まれたものだった。

実際にNext.js 16には `params` の非同期化など重要な変更があり、ドキュメントを確認してから実装したことでバグを未然に防げた。
:::

---

## Claude Code体験談

今回の最大の発見は「エラー文をそのまま投げると自律的に修正してくれる」という体験だ。

```
# こんな感じで投げるだけ
「デプロイでエラーになった。spawnSync docker ENOENT」
「requirements.txtが見つからないと言われた」
「新しいチャットボタンを押しても画面が切り替わらない」
```

Claude Codeは：
1. エラーの原因を説明する
2. 修正箇所のコードを書く
3. 関連ファイルも自動で直す
4. GitHubにコミット・プッシュまでやる

私がやったのは「エラー文をコピペする」だけで、あとはClaude Codeが直してくれた。

ただし、全部が一発で直るわけではない。ハマりポイント14（新しいチャットが始まらない問題）は3回の修正が必要だった。それでも、「なぜ直らないか」の原因説明と次の手を自分で考えてくれるのが助かった。

インフラの知識がなくても、**エラーログさえ読めれば前に進める**。これは非エンジニアにとって革命的な体験だった。

---

## GitHubリポジトリ

https://github.com/soh506/exo-brain

---

## おわりに・次のステップ

今回でここまでできた。

- ✅ **Phase 1**：チャットボット + 会話の自動保存（Lambda + DynamoDB）
- ✅ **Phase 2**：Amplifyでフロントをクラウドに公開 → スマホ・他PCからアクセス可能に

外部脳として真価を発揮するのはここから。

- **Phase 3**：ログイン機能（Cognito）→ 自分だけがアクセスできる
- **Phase 4**：全文検索（OpenSearch）→「あの話題どこだっけ」が探せる
- **Phase 5**：セマンティック検索（Bedrock）→ あいまいな言葉でも関連情報を提案

「アレってどうだったっけ？」と自分と会話できる外部脳を目指して、シリーズで続けていく。

---

*構築にはClaude Codeを使用しました。*
