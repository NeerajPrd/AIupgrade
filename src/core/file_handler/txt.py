from typing import List
from loguru import logger
from starlette.concurrency import run_in_threadpool
from charset_normalizer import from_bytes

from src.schemas.document import PageData


class TXTExtractionError(Exception):
    """Custom exception for plain-text extraction-related failures."""


class TXTDocumentExtractor:
    """Extracts text from a plain-text (.txt) file, detecting its encoding."""

    def __init__(self, file_bytes: bytes) -> None:
        if not file_bytes:
            logger.error("Initialization failed: file_bytes is empty.")
            raise ValueError("file_bytes must not be empty")

        self._file_bytes = file_bytes
        logger.debug("TXTDocumentExtractor initialized.")

    async def extract_pages(self) -> List[PageData]:
        """Asynchronously extracts text from the file as a single page."""
        return await run_in_threadpool(self._extract_pages_sync)

    def _extract_pages_sync(self) -> List[PageData]:
        try:
            match = from_bytes(self._file_bytes).best()
            if match is None:
                raise TXTExtractionError("Could not detect a valid text encoding")

            text = str(match)
            return [
                PageData(
                    content=text,
                    metadata={
                        "encoding": match.encoding,
                        "char_count": len(text),
                    },
                )
            ]

        except TXTExtractionError:
            raise
        except Exception as e:
            logger.exception("Unexpected error during TXT extraction.")
            raise TXTExtractionError(f"Unexpected error: {e}") from e
