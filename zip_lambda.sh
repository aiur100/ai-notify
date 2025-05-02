#!/bin/bash

# Script to create a zip backup of the pasley-assist codebase
# Created: $(date +"%Y-%m-%d")

# Set variables
PROJECT_NAME="pasley-assist"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${PROJECT_NAME}_backup_${TIMESTAMP}.zip"

# Print start message
echo "Creating backup of ${PROJECT_NAME} codebase..."

# Create zip file, excluding common unnecessary directories
zip -r "${BACKUP_FILE}" . \
    -x "*.git*" \
    -x "node_modules/*" \
    -x "*.zip" \
    -x "*.DS_Store" \
    -x "*.env" \
    -x "*.backup.sh"

# Check if zip was successful
if [ $? -eq 0 ]; then
    echo "Backup successfully created: ${BACKUP_FILE}"
    echo "Backup size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
    echo "Error: Backup creation failed!"
    exit 1
fi
