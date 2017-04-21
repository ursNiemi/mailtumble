# mailtumble
AWS Lambda SES Email Forwarder

## Overview

Receive incoming mail via AWS SES, then redirect (forward) it according to specified rules via any mail service including AWS SES.

## Features

- Retry on failure (eg. hitting throttle/rate limits when sending out)
- External lookup drivers (DynamoDB, MySQL, RESTful, etc)

## Credits

Based on [https://github.com/arithmetric/aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder) which is in turn based on [https://github.com/eleven41/aws-lambda-send-ses-email](https://github.com/eleven41/aws-lambda-send-ses-email)