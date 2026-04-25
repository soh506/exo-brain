import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
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

    // Anthropic APIキーはデプロイ時に環境変数で渡す
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";

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
        ANTHROPIC_API_KEY: anthropicApiKey,
        MODEL_ID: "claude-sonnet-4-6",
      },
    });

    conversationsTable.grantReadWriteData(chatHandler);

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
        allowOrigins: ["*"],
      },
    });

    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      "ChatIntegration",
      chatHandler
    );

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
