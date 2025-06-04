#!/bin/bash

# Script to check the latest logs of the alertSystem Lambda function and optionally search for text
# Created: $(date +"%Y-%m-%d")

# Default variables
LAMBDA_FUNCTION_NAME="alertSystem"
REGION="us-east-1"
PROFILE="pasley_hill"
LIMIT=100  # Increased default limit for search functionality
SEARCH_TEXT=""
HOURS=24  # Default to last 24 hours
MINUTES=0  # Additional minutes to add to hours
MAX_STREAMS=10  # Maximum number of log streams to process

# Function to display usage information
show_usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  -s, --search TEXT        Search for specific text in logs"
    echo "  -h, --hours HOURS        Search in logs from the last HOURS hours (default: 24)"
    echo "  -m, --minutes MINUTES    Additional minutes to add to hours (default: 0)"
    echo "  -l, --limit LIMIT        Limit number of log events to fetch (default: 100)"
    echo "  -n, --max-streams COUNT  Maximum number of log streams to process (default: 10)"
    echo "  -f, --function NAME      Lambda function name (default: alertSystem)"
    echo "  -r, --region REGION      AWS region (default: us-east-1)"
    echo "  -p, --profile PROFILE    AWS profile (default: pasley_hill)"
    echo "  --help                   Show this help message"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--search)
            SEARCH_TEXT="$2"
            shift 2
            ;;
        -h|--hours)
            HOURS="$2"
            shift 2
            ;;
        -m|--minutes)
            MINUTES="$2"
            shift 2
            ;;
        -l|--limit)
            LIMIT="$2"
            shift 2
            ;;
        -f|--function)
            LAMBDA_FUNCTION_NAME="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -n|--max-streams)
            MAX_STREAMS="$2"
            shift 2
            ;;
        --help)
            show_usage
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            ;;
    esac
done

# Calculate start time (current time minus specified hours and minutes)
TOTAL_SECONDS=$((HOURS * 3600 + MINUTES * 60))
START_TIME=$(($(date +%s) - TOTAL_SECONDS))
START_TIME_MS=$((START_TIME * 1000))  # Convert to milliseconds for AWS CLI

# Print start message
echo "===== Lambda Logs for ${LAMBDA_FUNCTION_NAME} ====="
if [ "$MINUTES" -gt 0 ]; then
    echo "Searching logs from the last ${HOURS} hours and ${MINUTES} minutes"
else
    echo "Searching logs from the last ${HOURS} hours"
fi
if [ -n "$SEARCH_TEXT" ]; then
    echo "Searching for text: '${SEARCH_TEXT}'"
fi

# Get log streams within the time range
if [ "$MINUTES" -gt 0 ]; then
    echo "Fetching log streams from the last ${HOURS} hours and ${MINUTES} minutes..."
else
    echo "Fetching log streams from the last ${HOURS} hours..."
fi
LOG_STREAMS=$(aws logs describe-log-streams \
    --log-group-name "/aws/lambda/${LAMBDA_FUNCTION_NAME}" \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --order-by LastEventTime \
    --descending \
    --max-items 50 \
    --output json)

# Check if log streams retrieval was successful
if [ $? -ne 0 ] || [ -z "$LOG_STREAMS" ] || [ "$LOG_STREAMS" == "[]" ]; then
    if [ "$MINUTES" -gt 0 ]; then
        echo "Error: Failed to retrieve log streams or no log streams found in the last ${HOURS} hours and ${MINUTES} minutes!"
    else
        echo "Error: Failed to retrieve log streams or no log streams found in the last ${HOURS} hours!"
    fi
    exit 1
fi

# Extract log stream names as array and filter by timestamp
LOG_STREAM_ARRAY=($(echo $LOG_STREAMS | jq -r --argjson start_time "$START_TIME_MS" '.logStreams[] | select(.lastEventTimestamp >= $start_time) | .logStreamName'))
if [ "$MINUTES" -gt 0 ]; then
    echo "Found ${#LOG_STREAM_ARRAY[@]} log streams in the last ${HOURS} hours and ${MINUTES} minutes"
else
    echo "Found ${#LOG_STREAM_ARRAY[@]} log streams in the last ${HOURS} hours"
fi

# Function to format timestamp
format_timestamp() {
    local timestamp=$1
    # For macOS
    if [[ "$(uname)" == "Darwin" ]]; then
        date -r $(($timestamp / 1000)) "+%Y-%m-%d %H:%M:%S"
    else
        # For Linux
        date -d @$(($timestamp / 1000)) "+%Y-%m-%d %H:%M:%S"
    fi
}

# Variable to track if we've found any matches
FOUND_MATCHES=false
MATCH_COUNT=0

# Process each log stream (limit to MAX_STREAMS)
STREAM_COUNT=0
for LOG_STREAM in "${LOG_STREAM_ARRAY[@]}"; do
    echo "Processing log stream: $LOG_STREAM"
    ((STREAM_COUNT++))
    
    # Stop if we've processed the maximum number of streams
    if [ "$STREAM_COUNT" -gt "$MAX_STREAMS" ]; then
        echo "Reached maximum number of streams to process ($MAX_STREAMS)"
        break
    fi
    
    # Get log events from the log stream
    LOG_EVENTS=$(aws logs get-log-events \
        --log-group-name "/aws/lambda/${LAMBDA_FUNCTION_NAME}" \
        --log-stream-name "$LOG_STREAM" \
        --start-time "$START_TIME_MS" \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --limit "$LIMIT" \
        --output json)
    
    # Check if log events retrieval was successful
    if [ $? -ne 0 ]; then
        echo "Warning: Failed to retrieve log events from stream $LOG_STREAM, skipping"
        continue
    fi
    
    # Process the log events
    if [ -n "$SEARCH_TEXT" ]; then
        # Search for specific text in log events
        while read -r event; do
            timestamp=$(echo "$event" | jq -r '.timestamp')
            message=$(echo "$event" | jq -r '.message')
            
            if echo "$message" | grep -q "$SEARCH_TEXT"; then
                echo "[$(format_timestamp "$timestamp")] $message"
                FOUND_MATCHES=true
                ((MATCH_COUNT++))
                
                # Break if we've reached the limit
                if [ "$MATCH_COUNT" -ge "$LIMIT" ]; then
                    echo "Reached limit of $LIMIT matches"
                    break 2
                fi
            fi
        done < <(echo "$LOG_EVENTS" | jq -c '.events[]')
    else
        # Just display all log events in time range
        while read -r event; do
            timestamp=$(echo "$event" | jq -r '.timestamp')
            message=$(echo "$event" | jq -r '.message')
            
            echo "[$(format_timestamp "$timestamp")] $message"
            FOUND_MATCHES=true
            ((MATCH_COUNT++))
            
            # Break if we've reached the limit
            if [ "$MATCH_COUNT" -ge "$LIMIT" ]; then
                echo "Reached limit of $LIMIT matches"
                break 2
            fi
        done < <(echo "$LOG_EVENTS" | jq -c '.events[]')
    fi
done

# Check if we found any matches
if [ "$FOUND_MATCHES" = false ]; then
    if [ -n "$SEARCH_TEXT" ]; then
        if [ "$MINUTES" -gt 0 ]; then
            echo "No log events containing '$SEARCH_TEXT' found in the last $HOURS hours and $MINUTES minutes"
        else
            echo "No log events containing '$SEARCH_TEXT' found in the last $HOURS hours"
        fi
    else
        if [ "$MINUTES" -gt 0 ]; then
            echo "No log events found in the last $HOURS hours and $MINUTES minutes"
        else
            echo "No log events found in the last $HOURS hours"
        fi
    fi
else
    echo "Found $MATCH_COUNT log events"
fi

echo "\n===== End of Lambda Logs ====="
echo "To follow logs in real-time, run:"
echo "aws logs tail /aws/lambda/${LAMBDA_FUNCTION_NAME} --profile ${PROFILE} --region ${REGION} --follow"
