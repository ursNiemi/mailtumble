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

## Credits

Based on [https://github.com/arithmetric/aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder) which is in turn based on [https://github.com/eleven41/aws-lambda-send-ses-email](https://github.com/eleven41/aws-lambda-send-ses-email)

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
