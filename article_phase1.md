# Claude CodeというAIエージェントに丸投げしてAWSチャットボットを作ったら動いた話

## はじめに

「自分専用の外部脳が欲しい」と思ったことはないだろうか。

気になったことを記録しておいて、あとから「あれってどうだったっけ？」と自然な言葉で検索できる。話しかけると関連する過去の情報を引っ張ってきてくれる。そういう自分だけにチューニングされた知識ベースのようなもの。

それを**AWS + Claude**で作れないかと考えた。

ただ私はインフラは触ったことがほぼない。コードも書けるわけではない。そこで**Claude Code**（Anthropicが提供するAIエージェントCLI）に設計から実装まで丸投げしてみることにした。

この記事はその記録だ。エラーをそのままClaude Codeに投げたら自律的に修正してくれた体験と、ハマりポイントを正直にまとめた。

---

## 完成物の概要

**ExoBrain**（外部脳チャットボット）Phase 1として以下を作った。

- Claudeと会話できるチャットUI
- 会話が自動的にDynamoDBに保存される
- 過去の会話を左サイドバーで一覧・再開できる

![完成イメージ: 左にサイドバー、右にチャット画面]()

### アーキテクチャ

```
ブラウザ（Next.js）
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
5. フロントエンドをローカルで起動して動作確認

---

## ハマりポイントと解決策（←これが本番）

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

### 3. Docker未インストールによるビルドエラー

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
    // Docker環境向けフォールバック
    command: ["bash", "-c", "pip install -r requirements.txt -t /asset-output && cp -r . /asset-output"],
  },
}),
```

`tryBundle` が成功すればDockerは使われない。

---

### 4. requirements.txt が見つからないエラー

```
Could not open requirements file: [Errno 2] No such file or directory: 'requirements.txt'
```

**原因：** `execSync` に `cwd` を指定していなかったため、pip3 がCDKディレクトリで `requirements.txt` を探していた。

**解決策：** フルパスで指定する。

```typescript
// NG
`pip3 install -r requirements.txt -t ${outputDir}`

// OK
`pip3 install -r ${srcDir}/requirements.txt -t ${outputDir}`
```

---

### 5. Anthropic APIのクレジット残高不足（最大の罠）

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

### 6. AmplifyデプロイでHTTP 404エラー

Amplifyにデプロイしたが、URLを開くと404。

**原因①：Next.jsのサーバーサイド機能が静的ホスティングで動かない**

`redirect()` や `await params` などのサーバーコンポーネント機能は、Amplifyの静的ホスティングモードでは実行されない。

**解決策：** `next.config.ts` に `output: 'export'` を追加して完全な静的エクスポートに変更。あわせてサーバーコンポーネントをクライアントコンポーネントに書き直した。

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};
```

**原因②：`amplify.yml` の出力ディレクトリが間違っていた**

`output: 'export'` の場合、Next.jsの出力先は `.next/` ではなく `out/` になる。最初の `amplify.yml` では `.next/` を指定していたため、Amplifyが正しいファイルを見つけられなかった。

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
// layout.tsx
<Suspense fallback={<div className="w-64 bg-gray-900" />}>
  <Sidebar />
</Suspense>
```

---

## Claude Code体験談

今回の最大の発見は「エラー文をそのまま投げると自律的に修正してくれる」という体験だ。

```
# こんな感じで投げるだけ
「デプロイでエラーになった。spawnSync docker ENOENT」
「requirements.txtが見つからないと言われた」
```

Claude Codeは：
1. エラーの原因を説明する
2. 修正箇所のコードを書く
3. 関連ファイルも自動で直す
4. GitHubにコミット・プッシュまでやる

私がやったのは「エラー文をコピペする」だけで、あとはClaude Codeが直してくれた。

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
