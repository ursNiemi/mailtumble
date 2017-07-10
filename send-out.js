'use strict';

const AWS = require('aws-sdk')
const SQS = new AWS.SQS({ apiVersion: '2012-11-05' })
const SES = new AWS.SES()

const QUEUE_URL = process.env.QUEUE_URL
const MAXIMUM_SEND_RATE = 14

function sendEmail(message) {
    console.log(`Sending an email to: ${message.recipients.join(',')}`)

    var params = {
        Destinations: message.recipients,
        Source: message.originalRecipient,
        RawMessage: {
            Data: message.emailData
        }
    }

    return new Promise(function(resolve, reject) {
        SES.sendRawEmail(params, function(err) {
            if (err) return reject(new Error("Error: Email sending failed."))

            resolve(`Sent email successfully to ${message.recipients.join(',')}`)
        })
    })
}

function processMessage(message) {
    return sendEmail(message).then(() => {
        const params = {
            QueueUrl: QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
        };

        return new Promise((resolve, reject) => {
            SQS.deleteMessage(params, (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            });
        })
    })
}

function getQueueData() {
    return new Promise((resolve, reject) => {
        SQS.getQueueAttributes({
            AttributeNames: [
                "ApproximateNumberOfMessages"
            ],
            QueueUrl: QUEUE_URL
        }, function(err, data) {
            if (err) { reject(err) } else resolve(data.Attributes.ApproximateNumberOfMessages);
        });
    })
}

function pollIteration(results) {
    const delay = 0
    const params = {
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 5,
        VisibilityTimeout: 10,
        WaitTimeSeconds: 5
    };

    return new Promise((resolve, reject) => {
        SQS.receiveMessage(params, (err, data) => {
            if (err) return reject(err);

            if (! data.Messages) {
                setTimeout(() => resolve(results.concat('Queue seems to be empty')), delay)
            } else {
                const promises = data.Messages.map((message) => processMessage(message));
                console.log(`${data.Messages.length} jobs received from the queue`)

                // complete when all invocations have been made
                Promise.series(promises).then(() => {
                    const result = `Messages processed: ${data.Messages.length}`;
                    console.log(result);
                    setTimeout(() => resolve(results.concat(result)), delay)
                });
            }
        });
    });
}

function poll() {
    const promises = Array(8).fill(pollIteration)

    return Promise.series(promises, [])
}

exports.handler = (event, context, callback) => {
    try {
        // Run orchestration (invoked by schedule)
        getQueueData().then((numItems) => {
            // Choose concurrency level
            const concurrency = Math.min(MAXIMUM_SEND_RATE, Math.max(1, Math.round(parseInt(numItems) / 40)));
            const promises = Array(concurrency).fill(poll())

            console.log(`Launching ${concurrency} workers`)

            Promise.all(promises).then((results) => {
                console.log(results)
                callback(null, results);
            });
        })
    } catch (err) {
        callback(err);
    }
};

Promise.series = function(promises, initValue) {
    return promises.reduce(function(chain, promise) {
        if (typeof promise !== 'function') {
            return Promise.reject(new Error("Error: Invalid promise item: " +
                promise));
        }
        return chain.then(promise);
    }, Promise.resolve(initValue));
};
