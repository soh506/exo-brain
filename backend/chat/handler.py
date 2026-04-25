import json
import os
import uuid
from datetime import datetime, timezone

import anthropic
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["CONVERSATIONS_TABLE"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
MODEL_ID = os.environ.get("MODEL_ID", "claude-sonnet-4-6")
DEFAULT_USER_ID = "default"

_anthropic_client = None


def get_anthropic_client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


def lambda_handler(event: dict, context) -> dict:
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")

    try:
        if method == "POST" and path == "/chat":
            return handle_chat(event)
        elif method == "GET" and path == "/conversations":
            return handle_list_conversations()
        elif method == "GET" and "/conversations/" in path:
            conversation_id = event.get("pathParameters", {}).get("conversationId")
            return handle_get_conversation(conversation_id)
        elif method == "DELETE" and "/conversations/" in path:
            conversation_id = event.get("pathParameters", {}).get("conversationId")
            return handle_delete_conversation(conversation_id)
        else:
            return response(404, {"error": "Not found"})
    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def handle_chat(event: dict) -> dict:
    body = json.loads(event.get("body") or "{}")
    user_message = body.get("message", "").strip()
    conversation_id = body.get("conversation_id")

    if not user_message:
        return response(400, {"error": "message is required"})

    table = dynamodb.Table(TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()

    # 既存の会話を取得、なければ新規作成
    if conversation_id:
        result = table.get_item(Key={"conversation_id": conversation_id})
        conversation = result.get("Item")
        if not conversation:
            return response(404, {"error": "Conversation not found"})
        messages = conversation.get("messages", [])
    else:
        conversation_id = str(uuid.uuid4())
        messages = []

    # Claude に渡すメッセージ履歴を構築
    messages.append({"role": "user", "content": user_message, "timestamp": now})

    claude_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
    ]

    # Claude API 呼び出し
    client = get_anthropic_client()
    claude_response = client.messages.create(
        model=MODEL_ID,
        max_tokens=4096,
        system=(
            "あなたはユーザーの外部脳として機能するAIアシスタントです。"
            "ユーザーが過去に記録した情報を整理・検索しやすい形で応答してください。"
            "日本語で会話します。"
        ),
        messages=claude_messages,
    )

    assistant_message = claude_response.content[0].text
    messages.append({
        "role": "assistant",
        "content": assistant_message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # タイトルは最初のユーザーメッセージから自動生成
    title = user_message[:50] if len(messages) == 2 else None

    # DynamoDB に保存
    item = {
        "conversation_id": conversation_id,
        "user_id": DEFAULT_USER_ID,
        "messages": messages,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if title:
        item["title"] = title
        item["created_at"] = now

    table.put_item(
        Item=item,
        ConditionExpression="attribute_not_exists(conversation_id) OR attribute_exists(conversation_id)",
    )

    # タイトルが既存の場合は取得
    if not title:
        result = table.get_item(Key={"conversation_id": conversation_id})
        title = result.get("Item", {}).get("title", "")

    return response(200, {
        "conversation_id": conversation_id,
        "message": assistant_message,
        "title": title,
    })


def handle_list_conversations() -> dict:
    table = dynamodb.Table(TABLE_NAME)
    result = table.query(
        IndexName="user-updated-index",
        KeyConditionExpression=Key("user_id").eq(DEFAULT_USER_ID),
        ScanIndexForward=False,  # 新しい順
        Limit=50,
    )
    conversations = [
        {
            "conversation_id": item["conversation_id"],
            "title": item.get("title", "無題"),
            "updated_at": item.get("updated_at", ""),
            "message_count": len(item.get("messages", [])),
        }
        for item in result.get("Items", [])
    ]
    return response(200, {"conversations": conversations})


def handle_get_conversation(conversation_id: str) -> dict:
    if not conversation_id:
        return response(400, {"error": "conversationId is required"})

    table = dynamodb.Table(TABLE_NAME)
    result = table.get_item(Key={"conversation_id": conversation_id})
    item = result.get("Item")

    if not item:
        return response(404, {"error": "Conversation not found"})

    return response(200, {
        "conversation_id": item["conversation_id"],
        "title": item.get("title", "無題"),
        "messages": item.get("messages", []),
        "created_at": item.get("created_at", ""),
        "updated_at": item.get("updated_at", ""),
    })


def handle_delete_conversation(conversation_id: str) -> dict:
    if not conversation_id:
        return response(400, {"error": "conversationId is required"})

    table = dynamodb.Table(TABLE_NAME)
    table.delete_item(Key={"conversation_id": conversation_id})
    return response(200, {"message": "Deleted"})


def response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }
