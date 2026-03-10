"""S3 utility functions for file upload and deletion."""
import os
import uuid
import logging

from fastapi import HTTPException

try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

logger = logging.getLogger(__name__)

if not HAS_BOTO3:
    logger.warning("boto3 not installed. S3 functionality will be disabled.")


def must_have_env(env_var: str) -> str:
    """Get environment variable or raise error if not set."""
    value = os.getenv(env_var)
    if value is None:
        raise Exception(f"Environment variable '{env_var}' is not set")
    return value


# S3 Configuration (lazy-loaded to allow imports without env vars)
_s3_bucket = None
_s3_region = None
_s3_client = None


def get_s3_config():
    """Get S3 configuration, raising error if not configured."""
    global _s3_bucket, _s3_region
    if _s3_bucket is None:
        _s3_bucket = must_have_env('AWS_S3_BUCKET')
        _s3_region = must_have_env('AWS_REGION')
    return _s3_bucket, _s3_region


def get_s3_client():
    """Get or create S3 client with lazy initialization."""
    global _s3_client
    if not HAS_BOTO3:
        raise HTTPException(status_code=501, detail="S3 functionality not available (boto3 not installed)")
    if _s3_client is None:
        aws_access_key = must_have_env('AWS_ACCESS_KEY_ID')
        aws_secret_key = must_have_env('AWS_SECRET_ACCESS_KEY')
        _, region = get_s3_config()
        _s3_client = boto3.client(
            's3',
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=region
        )
    return _s3_client


def upload_to_s3(file_content: bytes, filename: str, event_id: int, content_type: str) -> str:
    """Upload file to S3 and return the public URL."""
    s3_client = get_s3_client()
    bucket, region = get_s3_config()

    # Generate unique key with event folder structure
    file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'jpg'
    key = f"gallery/event-{event_id}/{uuid.uuid4().hex}.{file_ext}"

    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=file_content,
            ContentType=content_type
        )
    except Exception as e:
        logger.error(f"S3 upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image to storage")

    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def delete_from_s3(image_url: str) -> bool:
    """Delete file from S3 given its URL. Returns True if deleted, False if not an S3 URL."""
    bucket, _ = get_s3_config()

    if not image_url or 's3.' not in image_url or bucket not in image_url:
        return False  # Not an S3 URL (legacy base64 or other)

    s3_client = get_s3_client()

    try:
        # Extract key from URL: https://bucket.s3.region.amazonaws.com/key
        key = image_url.split('.amazonaws.com/')[-1]
        s3_client.delete_object(Bucket=bucket, Key=key)
        return True
    except Exception as e:
        logger.error(f"S3 delete error for {image_url}: {e}")
        return False
