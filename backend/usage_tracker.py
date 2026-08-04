"""Usage tracking for free-tier services."""

import time
import logging

logger = logging.getLogger(__name__)


class UsageStats:
    def __init__(self):
        self.groq_llm_requests = 0
        self.groq_stt_requests = 0
        self.tts_chars = 0
        self.tts_requests = 0
        self.errors: list[dict] = []
        self.session_start = time.time()

    def log_summary(self):
        elapsed = time.time() - self.session_start
        logger.info(
            f"=== Usage Summary ({elapsed:.0f}s session) ===\n"
            f"  Groq LLM: {self.groq_llm_requests} requests\n"
            f"  Groq STT: {self.groq_stt_requests} requests\n"
            f"  TTS: {self.tts_requests} requests, {self.tts_chars} chars\n"
            f"  Errors: {len(self.errors)}"
        )

    def log_error(self, error: str):
        self.errors.append({"time": time.time(), "error": error})
        if len(self.errors) > 100:
            self.errors = self.errors[-50:]


stats = UsageStats()
