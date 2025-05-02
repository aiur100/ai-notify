#!/bin/bash

# Check if container already exists and remove it
if [ "$(docker ps -aq -f name=dynamodb-local)" ]; then
    echo "Removing existing dynamodb-local container..."
    docker stop dynamodb-local >/dev/null 2>&1
    docker rm dynamodb-local >/dev/null 2>&1
fi

# Start DynamoDB Local in a Docker container
echo "Starting DynamoDB Local..."
docker run -d --name dynamodb-local -p 8000:8000 amazon/dynamodb-local

# Wait for DynamoDB to start
echo "Waiting for DynamoDB to start..."
sleep 3

# Set region
REGION="us-east-1"

# Create the event-batch-table
echo "Creating event-batch-table..."
aws dynamodb create-table \
  --table-name event-batch-table \
  --attribute-definitions AttributeName=channelId,AttributeType=S \
  --key-schema AttributeName=channelId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:8000 \
  --region ${REGION} \
  --profile vahelp

# Enable TTL on the table
echo "Enabling TTL on event-batch-table..."
aws dynamodb update-time-to-live \
  --table-name event-batch-table \
  --time-to-live-specification "Enabled=true, AttributeName=ttl" \
  --endpoint-url http://localhost:8000 \
  --region ${REGION} \
  --profile vahelp

echo "DynamoDB Local setup complete!"
echo "To list tables: aws dynamodb list-tables --endpoint-url http://localhost:8000 --region ${REGION} --profile vahelp"
echo "To stop the container: docker stop dynamodb-local"
echo "To remove the container: docker rm dynamodb-local"
