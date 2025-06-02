#!/bin/bash

# Script to create an EventBridge rule to trigger the Lambda function every 9 minutes
# This ensures events don't sit in DynamoDB for too long

# Set variables
LAMBDA_FUNCTION_NAME="alertSystem"
REGION="us-east-1"
PROFILE="pasley_hill"
RULE_NAME="alertSystem-scheduled-check"
SCHEDULE_EXPRESSION="rate(9 minutes)"
DESCRIPTION="Trigger alertSystem Lambda every 9 minutes to check for stale events"

# Print start message
echo "===== Creating EventBridge Scheduled Rule ====="

# Create the EventBridge rule
echo "Creating EventBridge rule..."
aws events put-rule \
    --name "$RULE_NAME" \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --description "$DESCRIPTION" \
    --state ENABLED \
    --profile "$PROFILE" \
    --region "$REGION"

# Get the Lambda function ARN
LAMBDA_ARN=$(aws lambda get-function \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --profile "$PROFILE" \
    --region "$REGION" \
    --query 'Configuration.FunctionArn' \
    --output text)

echo "Lambda ARN: $LAMBDA_ARN"

# Add permission for EventBridge to invoke the Lambda function
echo "Adding permission for EventBridge to invoke Lambda..."
aws lambda add-permission \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --statement-id "EventBridge-$RULE_NAME" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:$REGION:$(aws sts get-caller-identity --profile "$PROFILE" --query 'Account' --output text):rule/$RULE_NAME" \
    --profile "$PROFILE" \
    --region "$REGION"

# Create the target for the rule
echo "Setting Lambda as the target for the EventBridge rule..."
aws events put-targets \
    --rule "$RULE_NAME" \
    --targets "Id"="1","Arn"="$LAMBDA_ARN" \
    --profile "$PROFILE" \
    --region "$REGION"

echo "===== EventBridge Scheduled Rule Created ====="
echo "Rule Name: $RULE_NAME"
echo "Schedule: $SCHEDULE_EXPRESSION"
echo "Lambda Target: $LAMBDA_FUNCTION_NAME"
echo ""
echo "The Lambda function will now be triggered every 9 minutes to check for stale events."
