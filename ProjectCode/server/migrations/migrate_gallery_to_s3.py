"""
Migration script to move existing base64 gallery images to AWS S3.

This script:
1. Finds all gallery images stored as base64 data URLs
2. Uploads each to S3
3. Updates the database record with the S3 URL

Usage:
    cd ProjectCode/server
    python migrations/migrate_gallery_to_s3.py

Prerequisites:
    - AWS credentials must be configured in server/.env:
        AWS_ACCESS_KEY_ID=<your-access-key>
        AWS_SECRET_ACCESS_KEY=<your-secret-key>
        AWS_REGION=us-east-1
        AWS_S3_BUCKET=newbee-assets
    - S3 bucket must be created with public read access for gallery/* prefix
"""

import os
import sys
import base64
import uuid
import boto3
from botocore.exceptions import ClientError

# Add parent directory to path to import database modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import SessionLocal, EventGalleryImage
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def must_have_env(env_var: str) -> str:
    """Get environment variable or raise error if not set."""
    value = os.getenv(env_var)
    if value is None:
        raise Exception(f"Environment variable '{env_var}' is not set")
    return value


# S3 Configuration
S3_BUCKET = must_have_env('AWS_S3_BUCKET')
S3_REGION = must_have_env('AWS_REGION')


def get_s3_client():
    """Create S3 client with credentials from environment."""
    aws_access_key = must_have_env('AWS_ACCESS_KEY_ID')
    aws_secret_key = must_have_env('AWS_SECRET_ACCESS_KEY')

    return boto3.client(
        's3',
        aws_access_key_id=aws_access_key,
        aws_secret_access_key=aws_secret_key,
        region_name=S3_REGION
    )


def decode_base64_image(data_url: str) -> tuple:
    """
    Decode base64 data URL to bytes and content type.

    Args:
        data_url: Data URL in format "data:image/jpeg;base64,/9j/4AAQ..."

    Returns:
        Tuple of (image_bytes, content_type)
    """
    try:
        # Split header and data
        header, data = data_url.split(',', 1)
        # Extract content type: data:image/jpeg;base64 -> image/jpeg
        content_type = header.split(':')[1].split(';')[0]
        # Decode base64
        image_bytes = base64.b64decode(data)
        return image_bytes, content_type
    except Exception as e:
        raise ValueError(f"Failed to decode base64 data URL: {e}")


def get_extension(content_type: str) -> str:
    """Get file extension from content type."""
    mapping = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
    }
    return mapping.get(content_type, 'jpg')


def migrate_image(image: EventGalleryImage, db: Session, s3_client) -> bool:
    """
    Migrate a single image from base64 to S3.

    Args:
        image: EventGalleryImage database record
        db: Database session
        s3_client: Boto3 S3 client

    Returns:
        True if migration succeeded, False otherwise
    """
    try:
        # Skip if already migrated (not a data URL)
        if not image.image_url.startswith('data:image'):
            print(f"  Skipping image {image.id} - already migrated (not base64)")
            return True

        # Decode base64
        image_bytes, content_type = decode_base64_image(image.image_url)
        extension = get_extension(content_type)

        # Generate S3 key
        key = f"gallery/event-{image.event_id}/{uuid.uuid4().hex}.{extension}"

        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=image_bytes,
            ContentType=content_type
        )

        # Update database with S3 URL
        s3_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"
        image.image_url = s3_url
        db.commit()

        print(f"  Migrated image {image.id} -> {key} ({len(image_bytes)} bytes)")
        return True

    except ValueError as e:
        print(f"  ERROR migrating image {image.id}: {e}")
        db.rollback()
        return False
    except ClientError as e:
        print(f"  ERROR uploading image {image.id} to S3: {e}")
        db.rollback()
        return False
    except Exception as e:
        print(f"  ERROR migrating image {image.id}: {e}")
        db.rollback()
        return False


def main():
    """Run the migration."""
    print("=" * 60)
    print("Gallery Base64 to S3 Migration")
    print("=" * 60)
    print(f"\nS3 Bucket: {S3_BUCKET}")
    print(f"S3 Region: {S3_REGION}")
    print()

    # Initialize S3 client
    s3_client = get_s3_client()

    # Test S3 connection
    try:
        s3_client.head_bucket(Bucket=S3_BUCKET)
        print(f"Connected to S3 bucket: {S3_BUCKET}")
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        if error_code == '404':
            print(f"ERROR: S3 bucket '{S3_BUCKET}' does not exist.")
        elif error_code == '403':
            print(f"ERROR: Access denied to S3 bucket '{S3_BUCKET}'. Check permissions.")
        else:
            print(f"ERROR: Cannot access S3 bucket: {e}")
        sys.exit(1)

    # Get database session
    db = SessionLocal()

    try:
        # Find all base64 images
        images = db.query(EventGalleryImage).filter(
            EventGalleryImage.image_url.like('data:image%')
        ).all()

        total = len(images)
        print(f"\nFound {total} images to migrate")

        if total == 0:
            print("No base64 images found. Migration complete.")
            return

        # Confirm migration
        confirm = input(f"\nProceed with migrating {total} images? (y/N): ")
        if confirm.lower() != 'y':
            print("Migration cancelled.")
            return

        print()

        success = 0
        failed = 0

        for i, image in enumerate(images):
            print(f"Processing {i + 1}/{total} (image ID: {image.id}, event: {image.event_id})...")
            if migrate_image(image, db, s3_client):
                success += 1
            else:
                failed += 1

        print()
        print("=" * 60)
        print("Migration Summary")
        print("=" * 60)
        print(f"Total images:     {total}")
        print(f"Successfully migrated: {success}")
        print(f"Failed:           {failed}")

        if failed > 0:
            print("\nSome images failed to migrate. Check the errors above.")
            print("You can re-run this script to retry failed images.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
