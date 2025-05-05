# Design 
A system that collects events from any event that is posted to it. 
After an hour has past since the oldest entry, all entries are pulled between the oldest one and the most recent, and a report is generated and sent to the user.  

# Events 
- github
- Trello events 
- Slack messages 

# Architecture 
- AWS Lamda NodeJS 22 
- AWS DynamoDB table