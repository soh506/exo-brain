import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export class ExternalBrainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB: 会話履歴テーブル
    const conversationsTable = new dynamodb.Table(this, "ConversationsTable", {
      tableName: "external-brain-conversations",
      partitionKey: { name: "conversation_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // user_id + updated_at でリスト取得するためのGSI
    conversationsTable.addGlobalSecondaryIndex({
      indexName: "user-updated-index",
      partitionKey: { name: "user_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "updated_at", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Anthropic APIキーをSecrets Managerから取得
    const anthropicSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AnthropicApiKey",
      "external-brain/anthropic-api-key"
    );

    // Lambda: チャット処理
    const chatHandler = new lambda.Function(this, "ChatHandler", {
      functionName: "external-brain-chat",
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend/chat"), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            "bash",
            "-c",
            "pip install -r requirements.txt -t /asset-output && cp -r . /asset-output",
          ],
        },
      }),
      handler: "handler.lambda_handler",
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        CONVERSATIONS_TABLE: conversationsTable.tableName,
        ANTHROPIC_SECRET_NAME: "external-brain/anthropic-api-key",
        MODEL_ID: "claude-sonnet-4-6",
      },
    });

    // Lambda に DynamoDB と Secrets Manager の権限を付与
    conversationsTable.grantReadWriteData(chatHandler);
    anthropicSecret.grantRead(chatHandler);

    // HTTP API Gateway
    const httpApi = new apigateway.HttpApi(this, "ExternalBrainApi", {
      apiName: "external-brain-api",
      corsPreflight: {
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"], // Phase 6でCognito導入後に絞る
      },
    });

    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      "ChatIntegration",
      chatHandler
    );

    // ルーティング
    httpApi.addRoutes({
      path: "/chat",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/conversations",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/conversations/{conversationId}",
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.DELETE],
      integration: lambdaIntegration,
    });

    // 出力
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: httpApi.apiEndpoint,
      description: "API Gateway endpoint URL",
      exportName: "ExternalBrainApiEndpoint",
    });

    new cdk.CfnOutput(this, "ConversationsTableName", {
      value: conversationsTable.tableName,
      description: "DynamoDB table name",
    });
  }
}
