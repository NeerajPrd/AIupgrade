from enum import Enum
from loguru import logger
import os
from typing import Dict, List, Type

from src.core.file_handler.pdf import PDFDocumentExtractor
from src.core.file_handler.txt import TXTDocumentExtractor
from src.core.file_handler.docx import DOCXDocumentExtractor
from src.schemas.document import PageData, ProcessedDocument


class SupportedFileExtension(str, Enum):
    PDF = ".pdf"
    TXT = ".txt"
    DOCX = ".docx"

    @classmethod
    def from_filename(cls, filename: str) -> "SupportedFileExtension":
        _, ext = os.path.splitext(filename)
        ext = ext.lower()
        try:
            return cls(ext)
        except ValueError:
            raise NotImplementedError(f"No handler implemented for file type: '{ext}'")


class DocumentProcessor:
    """Service class for processing one or more document files."""

    def __init__(self) -> None:
        self._handler_registry: Dict[SupportedFileExtension, Type] = {
            SupportedFileExtension.PDF: PDFDocumentExtractor,
            SupportedFileExtension.TXT: TXTDocumentExtractor,
            SupportedFileExtension.DOCX: DOCXDocumentExtractor,
        }

    async def process_single_file(self, filename: str, file_bytes: bytes) -> "ProcessedDocument":
        """Process a single document and return extracted data or error."""
        logger.debug("Processing file: {}", filename)

        try:
            extension = SupportedFileExtension.from_filename(filename)
            handler_class = self._handler_registry.get(extension)

            if not handler_class:
                raise NotImplementedError(f"No handler registered for file type: {extension.value}")

            if not file_bytes:
                raise ValueError("Uploaded file is empty")

            handler = handler_class(file_bytes)
            extracted_content: List[PageData] = await handler.extract_pages()

            logger.info("File '{}' processed successfully.", filename)

            return ProcessedDocument(
                filename=filename, status="success", data=extracted_content
            )

        except Exception as e:
            logger.exception("Failed to process file '{}'. Error: {}", filename, e)
            return ProcessedDocument(filename=filename, status="error", error=str(e))

    async def process_multiple_files(
        self, files: Dict[str, bytes]
    ) -> List["ProcessedDocument"]:
        """
        Processes a list of files represented as (filename, file_bytes) tuples.
        Each file's result includes status, content, or error information.
        """
        results: List["ProcessedDocument"] = []

        for filename, file_bytes in files.items():
            result: ProcessedDocument = await self.process_single_file(filename, file_bytes)
            results.append(result)

        logger.info("All files have been successfully processed.")

        return results
