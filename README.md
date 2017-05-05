# mailtumble
[![Build Status](https://travis-ci.org/PoweredLocal/mailtumble.svg?branch=master)](https://travis-ci.org/PoweredLocal/mailtumble)

AWS Lambda SES Email Forwarder

## Overview

Receive incoming mail via AWS SES, then redirect (forward) it according to specified rules via any mail service including AWS SES itself.

Our flow is very simple:

![MailTumble flow](https://www.mysenko.com/images/mailtumble-flow.png)

## Why?

We have a [service](https://poweredlocal.com) that allows our customers to collect email addresses (as a byproduct of providing free WiFi) and use those for marketing purposes. But we wanted to further protect the owners of those email addresses from being over marketed too & having their personal information mishandled or insecurely stored. So we wanted a way where we could pass onto our customers a masked version of the email addresses - so if its ever abused, we could put a hold on it. Sort of how you email back and forth with an eBay seller.

We stumbled upon [https://github.com/arithmetric/aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder) but we could not
really use it.

The idea of forwarding emails right away based on SES triggers is nice but it only works for very small setups. What if you
receive 50,000 messages in one minute (eg. one of your users is sending out a marketing campaign)?

SES send out rate will quickly become a bottleneck. Limit for Lambda invocations will be imposed too. Chances are, you will
forward 20-50 messages and receive 40,000+ ThrottlingError's (status code 400). 
 
We had to look for a better solution that can adjust the sending pace according to limits and current queue size.

In other words we needed:

- An ability to cope with email bursts

- An ability to process (send out) emails later

- An ability to moderate/approve emails before sending them out

- An ability to lookup email aliases in an external repository

- A way to de-couple receiving and sending

- A way to process bounces and spam complaints

## Structure

- receive.js is Lambda function that parses incoming SES emails, checks if recipients exist in our user repository. Valid emails will be
placed in the outgoing email queue and can be processed any time later

- send-out.js polls a queue of outgoing emails and sends them out according to a dynamically calculated pace. You can easily replace this
part with your own worker (eg. [shoryuken](https://github.com/phstc/shoryuken))

- api-view.is is an example of an API gateway Lambda that responds to lookup queries made by `receive.js`

## Features

- Choosing the pace (concurrency) dynamically based on the queue size. If the queue is empty, run just one worker thread and wait for
messages. If the queue is large, run as many threads as you can afford (according to your current SES send rate).

- Retry on failure (eg. hitting throttle/rate limits when sending out)

- External lookup drivers (DynamoDB, MySQL, RESTful, etc)

## Installation

### Receiving part

Receiving is done by a single Node.js script `receive.js`. This function is triggered by SES.

1) Add your domain(s) in AWS Console in SES (Simple Email Service)
2) Add a rule set (see Email Receiving in the left sidebar) as follows:
  
![MailTumble SES Ruleset](https://www.mysenko.com/images/mailtumble-ses-ruleset.jpg)
  
As you can see, first we save the incoming message to an S3 bucket (we have to do this because larger email messages
won't fit in SNS/SQS), then we trigger a Lambda function that parses the message.
  
The bottleneck here is the limit of concurrent Lambda invocations. By default it's 1024.
  
Therefore, you want/plan to receive more than 1024 messages per second, you may want to replace second step with SNS topic
that forwards messages to an SQS queue, and then you invoke Lambda function to process the queue synchronously.  

3) Ensure this Lambda function has read permissions to the S3 bucket and publish permissions to the SQS queue.
4) Set the following environment variables for your receiving Lambda function:

**S3_BUCKET_NAME** S3 bucket name where emails will be stored

**S3_KEY_PREFIX** Is the bucket prefix (path), empty by default

**QUEUE_URL** Full URL to the SQS queue where processed messages will be pushed

**API_URL** RESTful endpoint to verify emails (see details below)

**FROM_EMAIL** From email will be rewritten to this value

In most cases you don't need to modify the function itself, configuration is done using variables.

### Sending part

Sending is done by a single multi-thread Lambda function `send-out.js` that should run every minute triggered by CloudWatch schedule.

1) Ensure your new From address is verified in SES.
2) Make sure your sending Lambda function has read access to S3 bucket, read access to the SQS queue, send access to SES.
3) Set the following environment variables for your sending Lambda function:

**S3_BUCKET_NAME** S3 bucket name where emails are stored

**S3_KEY_PREFIX** Is the bucket prefix (path), empty by default

**QUEUE_URL** Full URL to the SQS queue from where messages will be pulled

Every time this function starts, it first checks the number of messages in the queue – then it decides the pace based
on that and the current send-out limit. 

Check your current SES send-out limit and modify the constant `const MAXIMUM_SEND_RATE` accordingly. By default it's set to 14.

### Email rewrite rules

This example is using external RESTful API to check whether the recipient exists and what should be the new, rewritten
address.

We included a simple `api-view.js` Lambda function that runs via API Gateway and checks whether email exists in the 
DynamoDB table.

`API_URL` environment variable of `receive.js` refers to this endpoint. For example, we set `API_URL` to 
`https://api.email.com/aliases/`. Receiving script gets a message addressed to `john@smith.com` and makes a call to
`https://api.email.com/aliases/john@smith.com`. If it gets a valid response, redirect address is contained in the `alias`
JSON property of the response. Otherwise, email is considered not to exist.

Feel free to add more drivers.

### Processing complaints and bounces

In order to receive bounce and complaint notifications, go to Domains in SES, and click on your verified domain.
You can choose 3 SNS topics – bounces, complaints and deliveries:
 
![MailTumble SES Notifications](https://www.mysenko.com/images/mailtumble-ses-notifications.jpg)

Create corresponding SNS topics, then decide how do you want to process them – synchronously or asynchronously.

Async solution is to attach a Lambda function to each SNS topic that will mark email as failing in the email repository
(eg. DynamoDB). Sync solution is to create SQS queues that are subscribed to these SNS topics, then process these queues
using scheduled Lambda functions or your worker.

Our recommended solution is to rely on external API – process bounces/complaints asynchronously and make API calls (PUT)
that mark emails as "dead".

Then, `receive.js` may add a rule to ignore emails that are known to be broken.

## Credits

Receiving script is based on [https://github.com/arithmetric/aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder) which is in turn based on [https://github.com/eleven41/aws-lambda-send-ses-email](https://github.com/eleven41/aws-lambda-send-ses-email)

## License

Copyright (c) 2017 PoweredLocal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
