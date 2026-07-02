import os

# Whitelist approach: only these extensions may be uploaded as ticket attachments.
# No executables, scripts, or web content types - keeps this from becoming a
# vector for serving malicious files back to other users.
ALLOWED_ATTACHMENT_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.log',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.zip',
}

MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024  # 10 MB, matches DATA_UPLOAD_MAX_MEMORY_SIZE


def attachment_validation_error(file):
    """Returns an error message string if the upload should be rejected, else None."""
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        return f"File type '{ext or 'unknown'}' is not allowed."
    if file.size > MAX_ATTACHMENT_SIZE:
        return 'File exceeds the 10 MB size limit.'
    return None
