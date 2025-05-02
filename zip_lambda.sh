#!/bin/bash

# Script to create a zip package for Lambda deployment
# Created: $(date +"%Y-%m-%d")

# Set variables
PROJECT_NAME="pasley-assist"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${PROJECT_NAME}_lambda_${TIMESTAMP}.zip"

# Print start message
echo "Creating Lambda deployment package for ${PROJECT_NAME}..."

# Create zip file, excluding unnecessary directories and files
zip -r "${BACKUP_FILE}" . \
    -x "*.git*" \
    -x "node_modules/*" \
    -x "*.zip" \
    -x "*.DS_Store" \
    -x "*.env" \
    -x "*.backup.sh" \
    -x "env.json"

# Check if zip was successful
if [ $? -eq 0 ]; then
    echo "Lambda package successfully created: ${BACKUP_FILE}"
    echo "Package size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
    echo "Error: Lambda package creation failed!"
    exit 1
fi
