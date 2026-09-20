"""Tests for Telegram Bot API integration (`app/routers/telegram.py`).

Every external boundary is mocked: Telegram's own HTTP API (`getFile`,
file download, `sendMessage`), AWS S3, Textract, Bedrock, and DynamoDB.
No test in this module makes a real network call or a real AWS call —
that's covered separately by the manual live testing already done for
this feature (see the session history), not by this automated suite.

These tests exercise the webhook endpoint through FastAPI's `TestClient`
exactly as Telegram would call it: a bare `POST /api/integrations/telegram/webhook`
with a JSON body shaped like a real Telegram `Update`, no `Authorization`
header.
"""

from unittest.mock import patch

import pytest

from app.schemas.documents import Obligation

WEBHOOK_URL = "/api/integrations/telegram/webhook"


def _text_update(update_id: int, chat_id: int, message_id: int, text: str, date: int = 1_700_000_000) -> dict:
    return {
        "update_id": update_id,
        "message": {
            "message_id": message_id,
            "date": date,
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": chat_id, "is_bot": False, "first_name": "Test"},
            "text": text,
        },
    }


def _photo_update(update_id: int, chat_id: int, message_id: int, file_id: str = "FILE123") -> dict:
    return {
        "update_id": update_id,
        "message": {
            "message_id": message_id,
            "date": 1_700_000_000,
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": chat_id, "is_bot": False, "first_name": "Test"},
            "photo": [
                {"file_id": "FILE123-small", "file_unique_id": "u1", "width": 90, "height": 90},
                {"file_id": file_id, "file_unique_id": "u2", "width": 1280, "height": 720, "file_size": 12345},
            ],
        },
    }


_JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class TestWebhookParsing:
    """1. Telegram photo webhook parsing."""

    def test_photo_update_is_recognized_and_routed_to_photo_handler(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value=None) as mock_lookup, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(1, 111, 1))

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        mock_lookup.assert_called_once_with("111")
        # Unlinked chat: the bot must prompt to /connect, not attempt processing.
        mock_send.assert_called_once()
        assert "connect" in mock_send.call_args.args[1].lower()

    def test_non_message_update_is_accepted_and_ignored(self, client):
        with patch("app.routers.telegram.send_message") as mock_send:
            response = client.post(WEBHOOK_URL, json={"update_id": 2})

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        mock_send.assert_not_called()

    def test_message_with_no_text_and_no_photo_is_ignored(self, client):
        update = {
            "update_id": 3,
            "message": {
                "message_id": 5,
                "date": 1_700_000_000,
                "chat": {"id": 111, "type": "private"},
            },
        }
        with patch("app.routers.telegram.send_message") as mock_send:
            response = client.post(WEBHOOK_URL, json=update)

        assert response.status_code == 200
        mock_send.assert_not_called()

    def test_malformed_update_missing_required_field_returns_422(self, client):
        response = client.post(WEBHOOK_URL, json={"garbage": True})
        assert response.status_code == 422


class TestWebhookSecret:
    def test_wrong_secret_is_rejected(self, client):
        with patch("app.routers.telegram.get_settings") as mock_settings:
            mock_settings.return_value.telegram_webhook_secret = "expected-secret"
            response = client.post(
                WEBHOOK_URL,
                json={"update_id": 1},
                headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
            )
        assert response.status_code == 401

    def test_missing_secret_header_is_rejected_when_configured(self, client):
        with patch("app.routers.telegram.get_settings") as mock_settings:
            mock_settings.return_value.telegram_webhook_secret = "expected-secret"
            response = client.post(WEBHOOK_URL, json={"update_id": 1})
        assert response.status_code == 401

    def test_no_secret_configured_accepts_any_request(self, client):
        with patch("app.routers.telegram.get_settings") as mock_settings:
            mock_settings.return_value.telegram_webhook_secret = None
            response = client.post(WEBHOOK_URL, json={"update_id": 1})
        assert response.status_code == 200


class TestUnlinkedTelegramUser:
    """8. Unlinked Telegram user."""

    def test_unlinked_user_photo_message_gets_connect_prompt(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value=None), patch(
            "app.routers.telegram.send_message"
        ) as mock_send, patch("app.routers.telegram.create_source") as mock_create_source:
            response = client.post(WEBHOOK_URL, json=_photo_update(10, 222, 20))

        assert response.status_code == 200
        mock_create_source.assert_not_called()
        reply = mock_send.call_args.args[1]
        assert reply == "Please connect your OBLIGRA account first using /connect CODE."

    def test_unlinked_user_text_message_gets_connect_prompt(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value=None), patch(
            "app.routers.telegram.send_message"
        ) as mock_send, patch("app.routers.telegram.create_source") as mock_create_source:
            response = client.post(WEBHOOK_URL, json=_text_update(11, 222, 21, "Please renew the lease by Friday."))

        assert response.status_code == 200
        mock_create_source.assert_not_called()
        reply = mock_send.call_args.args[1]
        assert "connect" in reply.lower()


class TestPhotoProcessingPipeline:
    """2-7: Telegram file download, S3 upload, source creation, OCR, Bedrock, persistence."""

    def _run_photo_webhook(self, client, **overrides):
        obligations = overrides.pop(
            "obligations",
            [Obligation(action="Submit ID proof", deadline="Sep 27", condition=None, source="src", consequence=None, confidence=0.9)],
        )
        extracted_text = overrides.pop("extracted_text", "Submit ID proof by Sep 27.")

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc") as mock_lookup, patch(
            "app.routers.telegram.get_file_path", return_value=("photos/file_1.jpg", 12345)
        ) as mock_get_file, patch(
            "app.routers.telegram.download_file", return_value=_JPEG_BYTES
        ) as mock_download, patch(
            "app.routers.telegram.upload_fileobj"
        ) as mock_upload, patch(
            "app.routers.telegram.create_source"
        ) as mock_create_source, patch(
            "app.routers.telegram.extract_text", return_value=extracted_text
        ) as mock_extract_text, patch(
            "app.routers.telegram.extract_obligations", return_value=obligations
        ) as mock_extract_obligations, patch(
            "app.routers.telegram.save_obligations", return_value=obligations
        ) as mock_save, patch(
            "app.routers.telegram.update_source_status"
        ) as mock_update_status, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(20, 333, 30))

        return response, {
            "lookup": mock_lookup,
            "get_file": mock_get_file,
            "download": mock_download,
            "upload": mock_upload,
            "create_source": mock_create_source,
            "extract_text": mock_extract_text,
            "extract_obligations": mock_extract_obligations,
            "save": mock_save,
            "update_status": mock_update_status,
            "send": mock_send,
        }

    def test_full_photo_pipeline_calls_every_stage_in_order(self, client):
        response, mocks = self._run_photo_webhook(client)

        assert response.status_code == 200
        mocks["get_file"].assert_called_once_with("FILE123")
        mocks["download"].assert_called_once_with("photos/file_1.jpg")
        mocks["upload"].assert_called_once()
        # 4. Unique S3 key under telegram/{telegram_user_id}/{uuid}.jpg
        upload_key = mocks["upload"].call_args.args[1]
        assert upload_key.startswith("telegram/333/")
        assert upload_key.endswith(".jpg")

        # 5. Unified source created with the required fields.
        mocks["create_source"].assert_called_once()
        source_kwargs = mocks["create_source"].call_args.kwargs
        assert source_kwargs["source_type"] == "telegram"
        assert source_kwargs["title"] == "Telegram Screenshot"
        assert source_kwargs["original_reference"] == "30"
        assert source_kwargs["processing_status"] == "processing"

        # 6. Existing OCR pipeline invoked with the bucket/key just uploaded to.
        mocks["extract_text"].assert_called_once()

        # 7. Existing Bedrock extraction invoked with the OCR'd text.
        mocks["extract_obligations"].assert_called_once_with("Submit ID proof by Sep 27.")

        # 7. Obligations persisted via the existing DynamoDB layer, tied to the source.
        mocks["save"].assert_called_once()
        save_kwargs = mocks["save"].call_args.kwargs
        assert save_kwargs["user_id"] == "user-abc"
        assert save_kwargs["source_id"] == source_kwargs["source_id"]

        mocks["update_status"].assert_called_with(source_kwargs["source_id"], "completed", content="Submit ID proof by Sep 27.")

        # 10. Concise confirmation reply.
        reply = mocks["send"].call_args.args[1]
        assert "Screenshot processed by OBLIGRA" in reply
        assert "1 obligation(s) detected" in reply
        assert "Submit ID proof" in reply
        assert "Sep 27" in reply

    def test_no_obligations_detected_reply(self, client):
        response, mocks = self._run_photo_webhook(client, obligations=[])
        assert response.status_code == 200
        reply = mocks["send"].call_args.args[1]
        assert reply == "No actionable obligations were found in this screenshot."


class TestTelegramApiFailures:
    """9. Telegram API failure (getFile / download)."""

    def test_get_file_failure_returns_friendly_message_not_stack_trace(self, client):
        from app.services.telegram_client import TelegramError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", side_effect=TelegramError("boom: secret token leaked")
        ), patch("app.routers.telegram.create_source") as mock_create_source, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(30, 444, 40))

        assert response.status_code == 200
        mock_create_source.assert_not_called()
        reply = mock_send.call_args.args[1]
        assert "boom" not in reply
        assert "secret token" not in reply
        assert "Telegram" in reply

    def test_download_failure_returns_friendly_message(self, client):
        from app.services.telegram_client import TelegramError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", None)
        ), patch("app.routers.telegram.download_file", side_effect=TelegramError("network exploded")), patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(31, 444, 41))

        assert response.status_code == 200
        reply = mock_send.call_args.args[1]
        assert "network exploded" not in reply

    def test_oversized_reported_file_size_rejected_before_download(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 999_999_999)
        ), patch("app.routers.telegram.download_file") as mock_download, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(32, 444, 42))

        assert response.status_code == 200
        mock_download.assert_not_called()
        assert "too large" in mock_send.call_args.args[1].lower()


class TestInvalidImage:
    """10. Invalid/unsupported image."""

    def test_unrecognized_file_signature_is_rejected(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.bin", 100)
        ), patch("app.routers.telegram.download_file", return_value=b"not an image at all"), patch(
            "app.routers.telegram.upload_fileobj"
        ) as mock_upload, patch("app.routers.telegram.send_message") as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(40, 555, 50))

        assert response.status_code == 200
        mock_upload.assert_not_called()
        reply = mock_send.call_args.args[1]
        assert "image" in reply.lower()

    def test_png_signature_is_accepted(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.png", 100)
        ), patch("app.routers.telegram.download_file", return_value=_PNG_BYTES), patch(
            "app.routers.telegram.upload_fileobj"
        ) as mock_upload, patch("app.routers.telegram.create_source"), patch(
            "app.routers.telegram.extract_text", return_value="some text"
        ), patch("app.routers.telegram.extract_obligations", return_value=[]), patch(
            "app.routers.telegram.save_obligations", return_value=[]
        ), patch("app.routers.telegram.update_source_status"), patch("app.routers.telegram.send_message"):
            response = client.post(WEBHOOK_URL, json=_photo_update(41, 555, 51))

        assert response.status_code == 200
        upload_key = mock_upload.call_args.args[1]
        assert upload_key.endswith(".png")


class TestS3UploadFailure:
    def test_s3_upload_failure_returns_friendly_message(self, client):
        from app.services.s3_client import S3UploadError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 100)
        ), patch("app.routers.telegram.download_file", return_value=_JPEG_BYTES), patch(
            "app.routers.telegram.upload_fileobj", side_effect=S3UploadError("AWS credentials rejected: AKIA...")
        ), patch("app.routers.telegram.create_source") as mock_create_source, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(50, 666, 60))

        assert response.status_code == 200
        mock_create_source.assert_not_called()
        reply = mock_send.call_args.args[1]
        assert "AKIA" not in reply
        assert "credentials" not in reply.lower()


class TestTextractFailure:
    def test_textract_failure_marks_source_failed_and_replies_clearly(self, client):
        from app.services.textract_client import TextractError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 100)
        ), patch("app.routers.telegram.download_file", return_value=_JPEG_BYTES), patch(
            "app.routers.telegram.upload_fileobj"
        ), patch("app.routers.telegram.create_source") as mock_create_source, patch(
            "app.routers.telegram.extract_text", side_effect=TextractError("job failed: INVALID_IMAGE")
        ), patch("app.routers.telegram.update_source_status") as mock_update_status, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(60, 777, 70))

        assert response.status_code == 200
        source_id = mock_create_source.call_args.kwargs["source_id"]
        mock_update_status.assert_called_with(source_id, "failed")
        reply = mock_send.call_args.args[1]
        assert reply == "I couldn't read the screenshot clearly. Please send a clearer image."
        assert "INVALID_IMAGE" not in reply

    def test_empty_ocr_result_returns_could_not_read_message(self, client):
        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 100)
        ), patch("app.routers.telegram.download_file", return_value=_JPEG_BYTES), patch(
            "app.routers.telegram.upload_fileobj"
        ), patch("app.routers.telegram.create_source"), patch(
            "app.routers.telegram.extract_text", return_value="   "
        ), patch("app.routers.telegram.update_source_status") as mock_update_status, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(61, 777, 71))

        assert response.status_code == 200
        reply = mock_send.call_args.args[1]
        assert reply == "I couldn't read the screenshot clearly. Please send a clearer image."


class TestBedrockFailure:
    def test_bedrock_failure_returns_friendly_message(self, client):
        from app.services.bedrock_client import BedrockError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 100)
        ), patch("app.routers.telegram.download_file", return_value=_JPEG_BYTES), patch(
            "app.routers.telegram.upload_fileobj"
        ), patch("app.routers.telegram.create_source"), patch(
            "app.routers.telegram.extract_text", return_value="Some obligation text."
        ), patch(
            "app.routers.telegram.extract_obligations",
            side_effect=BedrockError("model unavailable, region us-east-1"),
        ), patch("app.routers.telegram.update_source_status") as mock_update_status, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(70, 888, 80))

        assert response.status_code == 200
        mock_update_status.assert_called()
        assert mock_update_status.call_args.args[1] == "failed"
        reply = mock_send.call_args.args[1]
        assert "model unavailable" not in reply


class TestDynamoDBFailure:
    def test_save_obligations_failure_returns_friendly_message(self, client):
        from app.services.dynamodb_client import DynamoDBError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 100)
        ), patch("app.routers.telegram.download_file", return_value=_JPEG_BYTES), patch(
            "app.routers.telegram.upload_fileobj"
        ), patch("app.routers.telegram.create_source"), patch(
            "app.routers.telegram.extract_text", return_value="Some obligation text."
        ), patch(
            "app.routers.telegram.extract_obligations",
            return_value=[Obligation(action="Do X", deadline=None, condition=None, source="s", consequence=None, confidence=0.5)],
        ), patch(
            "app.routers.telegram.save_obligations", side_effect=DynamoDBError("table throughput exceeded")
        ), patch("app.routers.telegram.update_source_status") as mock_update_status, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(80, 999, 90))

        assert response.status_code == 200
        mock_update_status.assert_called()
        assert mock_update_status.call_args.args[1] == "failed"
        reply = mock_send.call_args.args[1]
        assert "throughput" not in reply

    def test_create_source_failure_returns_friendly_message_before_ocr(self, client):
        from app.services.dynamodb_client import DynamoDBError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value="user-abc"), patch(
            "app.routers.telegram.get_file_path", return_value=("photos/f.jpg", 100)
        ), patch("app.routers.telegram.download_file", return_value=_JPEG_BYTES), patch(
            "app.routers.telegram.upload_fileobj"
        ), patch(
            "app.routers.telegram.create_source", side_effect=DynamoDBError("connection refused")
        ), patch("app.routers.telegram.extract_text") as mock_extract_text, patch(
            "app.routers.telegram.send_message"
        ) as mock_send:
            response = client.post(WEBHOOK_URL, json=_photo_update(90, 1000, 100))

        assert response.status_code == 200
        mock_extract_text.assert_not_called()
        reply = mock_send.call_args.args[1]
        assert "connection refused" not in reply


class TestMissingTelegramToken:
    def test_send_message_without_token_does_not_fail_the_request(self, client):
        from app.services.telegram_client import TelegramNotConfiguredError

        with patch("app.routers.telegram.get_user_id_for_chat", return_value=None), patch(
            "app.routers.telegram.send_message", side_effect=TelegramNotConfiguredError("no token")
        ):
            response = client.post(WEBHOOK_URL, json=_text_update(100, 1111, 110, "hello"))

        # Even if replying to Telegram is impossible (no bot token
        # configured), the webhook itself must not fail — Telegram would
        # otherwise interpret a 5xx as a delivery failure and retry.
        assert response.status_code == 200
        assert response.json() == {"ok": True}
