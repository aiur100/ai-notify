#!/bin/bash

# Script to update Lambda environment variables from env.json
# This script uses AWS CLI's JSON input feature to avoid shell parsing issues

LAMBDA_FUNCTION_NAME="alertSystem"
REGION="us-east-1"
PROFILE="pasley_hill"
ENV_FILE="env.json"

echo "===== Lambda Environment Variables Update Script ====="

# Check if env.json exists
if [ ! -f "${ENV_FILE}" ]; then
    echo "Error: ${ENV_FILE} not found!"
    exit 1
fi

# Create a temporary JSON file for AWS CLI input
TEMP_JSON=$(mktemp)

# Format the environment variables JSON for AWS CLI
echo "Preparing environment variables from ${ENV_FILE}..."
cat > "${TEMP_JSON}" << EOF
{
  "FunctionName": "${LAMBDA_FUNCTION_NAME}",
  "Environment": {
    "Variables": $(jq '.MyFunction' "${ENV_FILE}")
  }
}
EOF

# Print the first few lines of the generated JSON for verification
echo "Generated JSON (first 5 lines):"
head -5 "${TEMP_JSON}"

# Update Lambda function environment variables
echo "Updating Lambda function environment variables..."
aws lambda update-function-configuration \
    --cli-input-json "file://${TEMP_JSON}" \
    --region "${REGION}" \
    --profile "${PROFILE}"

# Check if update was successful
if [ $? -ne 0 ]; then
    echo "Error: Lambda function environment variables update failed!"
    rm "${TEMP_JSON}"
    exit 1
fi

# Clean up
rm "${TEMP_JSON}"

echo "===== Lambda environment variables updated successfully! ====="
echo "Function: ${LAMBDA_FUNCTION_NAME}"
echo "Environment variables updated from: ${ENV_FILE}"
