"use strict";

var AWS = require("aws-sdk")
var https = require('https')
const url = require('url')

const API_URL = process.env.API_URL
const API_TOKEN = process.env.API_TOKEN
const QUEUE_URL = process.env.QUEUE_URL
const SUBJECT_PREFIX = process.env.SUBJECT_PREFIX || ''
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME
const S3_KEY_PREFIX = process.env.S3_KEY_PREFIX || ''
const UNSUBSCRIBE_URL = process.env.UNSUBSCRIBE_URL || 'https://subscriptions.mailtumble.com/unsubscribe'

/**
 * Parses the SES event record provided for the `mail` and `receipients` data.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.parseEvent = function parseEvent(data) {
    // Validate characteristics of a SES event record.
    if (
        !data.event ||
        !data.event.hasOwnProperty("Records") ||
        data.event.Records.length !== 1 ||
        !data.event.Records[0].hasOwnProperty("eventSource") ||
        data.event.Records[0].eventSource !== "aws:ses" ||
        data.event.Records[0].eventVersion !== "1.0"
    ) {
        data.log({
            message: "parseEvent() received invalid SES message:",
            level: "error",
            event: JSON.stringify(data.event)
        })
        return Promise.reject(new Error("Error: Received invalid SES message."))
    }

    data.email = data.event.Records[0].ses.mail
    data.recipients = data.event.Records[0].ses.receipt.recipients

    return Promise.resolve(data)
}

/**
 * Transforms the original recipients to the desired forwarded destinations.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
function rewriteRecipients(data) {
    var promises = []

    data.originalRecipients = data.recipients

    data.recipients.forEach(function(origEmail) {
        promises.push(
            new Promise((resolve, reject) => {
                var origEmailKey = origEmail.toLowerCase()

                const options = url.parse(`${API_URL}/aliases/${origEmailKey}`);

                options.method = 'GET'
                options.headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_TOKEN}`
                }

                const getReq = https.request(options, function(res) {
                    if (res.statusCode != 200) {
                        resolve(null)
                        return
                    }

                    const chunks = [];

                    res.setEncoding('utf8');
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        let body = chunks.join('')
                        let data = JSON.parse(body)

                        if (data.count_complaint) return resolve(null)
                        if (parseInt(data.count_bounce) > 3) return resolve(null)
                        if (data.optout) return resolve(null)

                        resolve(data.email)
                    });
                }).on('error', function(e) {
                    console.log("Got error: " + e.message);

                    resolve(null)
                });

                getReq.end();
            })
        )
    })

    return Promise.all(promises).then(newRecipients => {
        newRecipients = newRecipients.filter(value => value)

        if (!newRecipients.length) {
            data.log({
                message: "Finishing process. No new recipients found for " +
                "original destinations: " +
                data.originalRecipients.join(", "),
                level: "info"
            })

            return data.callback()
        }

        data.recipients = newRecipients
        data.originalRecipient = data.originalRecipients[0]

        return data
    });
}

/**
 * Fetches the message data from S3.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.fetchMessage = function fetchMessage(data) {
    const key = `${S3_KEY_PREFIX}${data.email.messageId}`

    data.log({
        level: "info",
        message: `Fetching email at s3://${S3_BUCKET_NAME}/${key}`
    })

    return new Promise(function(resolve, reject) {
        // Load the raw email from S3
        data.s3.getObject(
            {
                Bucket: S3_BUCKET_NAME,
                Key: key
            },
            function(err, result) {
                if (err) {
                    data.log({
                        level: "error",
                        message: "getObject() returned error:",
                        error: err,
                        stack: err.stack
                    })

                    return reject(
                        new Error(`Error: Failed to load message body from S3: ${key}`)
                    )
                }

                data.emailData = result.Body.toString()

                return resolve(data)
            }
        )
    })
}

/**
 * Processes the message data, making updates to recipients and other headers
 * before forwarding message.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.processHeaders = function processHeaders(data) {
    var match = data.emailData.match(/^((?:.+\r?\n)*)(\r?\n(?:.*\s+)*)/m);
    var header = match && match[1] ? match[1] : data.emailData;
    var body = match && match[2] ? match[2] : '';

    // Add "Reply-To:" with the "From" address if it doesn't already exists
    if (!/^Reply-To: /im.test(header)) {
        match = header.match(/^From: (.*(?:\r?\n\s+.*)*\r?\n)/m);
        var from = match && match[1] ? match[1] : ""
        if (from) {
            header = header + "Reply-To: " + from
            data.log({
                level: "info",
                message: "Added Reply-To address of: " + from
            })
        } else {
            data.log({
                level: "info",
                message: "Reply-To address not added because " +
                "From address was not properly extracted."
            })
        }
    }

    // SES does not allow sending messages from an unverified address,
    // so replace the message's "From:" header with the original
    // recipient (which is a verified domain)
    header = header.replace(/^From: (.*(?:\r?\n\s+.*)*)/mg, function(match, from) {
        var fromText
        if (process.env.FROM_EMAIL) {
            fromText = 'From: ' + from.replace(/<(.*)>/, '').trim() +
                ' <' + process.env.FROM_EMAIL + '>';
        } else {
            fromText = 'From: ' + from.replace('<', 'at ').replace('>', '') +
                ' <' + data.originalRecipient + '>';
        }
        return fromText
    })

    // Add a prefix to the Subject
    if (SUBJECT_PREFIX) {
        header = header.replace(/^Subject: (.*)/gm, function(match, subject) {
            return "Subject: " + SUBJECT_PREFIX + subject
        })
    }

    // Remove the Return-Path header.
    header = header.replace(/^Return-Path: (.*)\r?\n/gm, "")

    // Remove Sender header.
    header = header.replace(/^Sender: (.*)\r?\n/gm, "")

    // Remove Message-ID header.
    header = header.replace(/^Message-ID: (.*)\r?\n/mig, '');

    // Remove all DKIM-Signature headers to prevent triggering an
    // "InvalidParameterValue: Duplicate header 'DKIM-Signature'" error.
    // These signatures will likely be invalid anyways, since the From
    // header was modified.
    header = header.replace(/^DKIM-Signature: .*\r?\n(\s+.*\r?\n)*/gm, "")

    let email = data.recipients.find(recipient => recipient.match(/@mailtumble.com$/))

    if (email) {
        header = header + `List-Unsubscribe: <${UNSUBSCRIBE_URL}?email=${email}>
`
    }

    data.newHeader = header
    data.emailData = header + body;

    return Promise.resolve(data)
}

/**
 * Send email using the SES sendRawEmail command.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
function enqueueMessage(data) {
    var params = {
        MessageBody: JSON.stringify({
            header: data.newHeader,
            messageId: data.email.messageId,
            recipients: data.recipients,
            originalRecipient: data.originalRecipient
        }),
        QueueUrl: QUEUE_URL
    }

    data.log({
        level: "info",
        message: "enqueueMessage: Saving outgoing email in the queue. " +
        "Original recipients: " +
        data.originalRecipients.join(", ") +
        ". Transformed recipients: " +
        data.recipients.join(", ") +
        "."
    })

    return new Promise(function(resolve, reject) {
        data.sqs.sendMessage(params, function(err, result) {
            if (err) {
                data.log({
                    level: "error",
                    message: "enqueueMessage() returned error.",
                    error: err,
                    stack: err.stack
                })

                return reject(new Error("Error: Email enqueuing failed."))
            }

            data.log({
                level: "info",
                message: "enqueueMessage() successful.",
                result: result
            })

            resolve(data)
        })
    })
}

/**
 * Handler function to be invoked by AWS Lambda with an inbound SES email as
 * the event.
 *
 * @param {object} event - Lambda event from inbound email received by AWS SES.
 * @param {object} context - Lambda context object.
 * @param {object} callback - Lambda callback object.
 * @param {object} overrides - Overrides for the default data, including the
 * configuration, SES object, and S3 object.
 */
exports.handler = function(event, context, callback, overrides) {
    var steps = overrides && overrides.steps
        ? overrides.steps
        : [
        parseEvent,
        rewriteRecipients,
        fetchMessage,
        processHeaders,
        enqueueMessage
    ]

    var data = {
        event: event,
        callback: callback,
        context: context,
        log: overrides && overrides.log ? overrides.log : console.log,
        sqs: overrides && overrides.sqs ? overrides.sqs : new AWS.SQS(),
        s3: overrides && overrides.s3 ? overrides.s3 : new AWS.S3({ signatureVersion: "v4" })
    }

    Promise.series(steps, data)
        .then(function(data) {
            data.log({ level: "info", message: "Process finished successfully." })
            return data.callback()
        })
        .catch(function(err) {
            data.log({
                level: "error",
                message: "Step returned error: " + err.message,
                error: err,
                stack: err.stack
            })
            return data.callback(new Error("Error: Step returned error."))
        })
}

Promise.series = function(promises, initValue) {
    return promises.reduce(function(chain, promise) {
        if (typeof promise !== "function") {
            return Promise.reject(
                new Error("Error: Invalid promise item: " + promise)
            )
        }
        return chain.then(promise)
    }, Promise.resolve(initValue))
}
