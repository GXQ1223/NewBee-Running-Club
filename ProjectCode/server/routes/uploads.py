"""File upload endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from typing import Optional
from pathlib import Path
import uuid
import logging

from database import get_db, Member
from utils.auth import get_current_committee_or_admin
from utils.s3 import get_s3_client, get_s3_config

logger = logging.getLogger(__name__)
router = APIRouter(tags=["uploads"])

# Mapping of file extensions to MIME types
ALLOWED_IMAGE_EXTENSIONS = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
}


@router.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    current_admin: Member = Depends(get_current_committee_or_admin)
):
    """Upload an image file to S3 (admin only). Returns the public S3 URL."""
    # Get file extension
    file_ext = Path(file.filename).suffix.lower() if file.filename else ''

    # Determine MIME type from extension or content_type
    allowed_content_types = list(ALLOWED_IMAGE_EXTENSIONS.values())

    if file.content_type in allowed_content_types:
        mime_type = file.content_type
    elif file_ext in ALLOWED_IMAGE_EXTENSIONS:
        mime_type = ALLOWED_IMAGE_EXTENSIONS[file_ext]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: JPEG, PNG, GIF, WebP"
        )

    # Validate file size (max 20MB)
    max_size = 20 * 1024 * 1024  # 20MB
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 20MB."
        )

    try:
        # Resize/compress image to save S3 space
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(contents))

        # Convert RGBA/P to RGB for JPEG output
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Resize if larger than 1920px on the longest side
        max_dimension = 1920
        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

        # Save as JPEG with quality 85
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        contents = output.getvalue()
        mime_type = 'image/jpeg'
        safe_ext = 'jpg'

        # Upload to S3
        s3_client = get_s3_client()
        bucket, region = get_s3_config()
        key = f"homepage/{uuid.uuid4().hex}.{safe_ext}"

        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=contents,
            ContentType=mime_type
        )

        url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(e)}"
        )
    finally:
        await file.close()
