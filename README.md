# mailtumble
[![Build Status](https://travis-ci.org/PoweredLocal/mailtumble.svg?branch=master)](https://travis-ci.org/PoweredLocal/mailtumble)

AWS Lambda SES Email Forwarder

## Overview

Receive incoming mail via AWS SES, then redirect (forward) it according to specified rules via any mail service including AWS SES itself.

Our flow is very simple:

![MailTumble flow](https://www.mysenko.com/images/mailtumble-flow.png)

## Why?

Why stumbled upon [https://github.com/arithmetric/aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder) but we could not
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
placed in the outgoing email queue

- send-out.js polls a queue of outgoing emails and sends them out according to a dynamically set pace

- api-view.is is an example of an API gateway Lambda that responds to lookup queries made by `receive.js`

## Features

- Retry on failure (eg. hitting throttle/rate limits when sending out)

- External lookup drivers (DynamoDB, MySQL, RESTful, etc)

## Credits

Based on [https://github.com/arithmetric/aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder) which is in turn based on [https://github.com/eleven41/aws-lambda-send-ses-email](https://github.com/eleven41/aws-lambda-send-ses-email)
