#!/bin/bash

# Script to create a zip package for Lambda deployment and update environment variables
# Created: $(date +"%Y-%m-%d")

# Set variables
PROJECT_NAME="pasley-assist"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LAMBDA_FUNCTION_NAME="alertSystem"
REGION="us-east-1"
PROFILE="pasley_hill"
ZIP_FILE="${PROJECT_NAME}_lambda_${TIMESTAMP}.zip"
ENV_FILE="env.json"

# Print start message
echo "===== Lambda Deployment Script for ${PROJECT_NAME} ====="
echo "Creating Lambda deployment package..."

# Create zip file, excluding unnecessary directories and files
zip -r "${ZIP_FILE}" . \
    -x "*.git*" \
    -x "node_modules/*" \
    -x "*.zip" \
    -x "*.DS_Store" \
    -x "*.env" \
    -x "*.backup.sh" \
    -x "env.json"

# Check if zip was successful
if [ $? -ne 0 ]; then
    echo "Error: Lambda package creation failed!"
    exit 1
fi

echo "Lambda package successfully created: ${ZIP_FILE}"
echo "Package size: $(du -h "${ZIP_FILE}" | cut -f1)"

# Check if env.json exists
if [ ! -f "${ENV_FILE}" ]; then
    echo "Error: ${ENV_FILE} not found!"
    exit 1
fi

# Extract environment variables from env.json
echo "Extracting environment variables from ${ENV_FILE}..."

# Use jq to extract environment variables directly in the format needed by AWS CLI
ENV_VARS_STR=$(jq -r '.MyFunction | keys_unsorted[] as $k | "\($k)=\(.[$k])"' "${ENV_FILE}" | tr '\n' ',' | sed 's/,$//')

# Check if extraction was successful
if [ -z "$ENV_VARS_STR" ]; then
    echo "Error: Failed to extract environment variables from ${ENV_FILE}!"
    exit 1
fi

echo "Environment variables extracted successfully."

# Print the first few environment variables for verification (truncated for security)
echo "First few environment variables (truncated):"
echo "$ENV_VARS_STR" | tr ',' '\n' | head -3 | sed 's/=.*$/=*****/g'

# Update Lambda function code
echo "Updating Lambda function code..."
aws lambda update-function-code \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --zip-file "fileb://${ZIP_FILE}" \
    --region "${REGION}" \
    --profile "${PROFILE}"

if [ $? -ne 0 ]; then
    echo "Error: Lambda function code update failed!"
    exit 1
fi

# Wait for the Lambda function update to complete
echo "Waiting for Lambda function update to complete..."
function_state="InProgress"
max_attempts=30
attempt=1

while [ "$function_state" = "InProgress" ] && [ $attempt -le $max_attempts ]; do
    echo "Checking Lambda function state (attempt $attempt/$max_attempts)..."
    
    # Get the current state of the Lambda function
    function_info=$(aws lambda get-function \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --region "${REGION}" \
        --profile "${PROFILE}" \
        --query "Configuration.LastUpdateStatus" \
        --output text)
    
    function_state=$function_info
    
    if [ "$function_state" = "InProgress" ]; then
        echo "Lambda function update is still in progress. Waiting 5 seconds..."
        sleep 5
        attempt=$((attempt + 1))
    else
        echo "Lambda function update completed with status: $function_state"
    fi
done

if [ "$function_state" = "InProgress" ]; then
    echo "Error: Lambda function update is taking too long. Please check the AWS console."
    exit 1
fi

if [ "$function_state" != "Successful" ]; then
    echo "Error: Lambda function update failed with status: $function_state"
    exit 1
fi

# Update Lambda function environment variables
echo "Updating Lambda function environment variables..."
aws lambda update-function-configuration \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --environment "Variables={${ENV_VARS_STR}}" \
    --timeout 300 \
    --region "${REGION}" \
    --profile "${PROFILE}" \
    --output text

if [ $? -ne 0 ]; then
    echo "Error: Lambda function environment variables update failed!"
    exit 1
fi

echo "===== Lambda deployment completed successfully! ====="
echo "Function: ${LAMBDA_FUNCTION_NAME}"
echo "Package: ${ZIP_FILE}"
echo "Environment variables updated from: ${ENV_FILE}"

# Optional: Display Lambda logs
echo ""
echo "To monitor Lambda logs, run:"
echo "aws logs tail /aws/lambda/${LAMBDA_FUNCTION_NAME} --profile ${PROFILE} --region ${REGION} --follow"
