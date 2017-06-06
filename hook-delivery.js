'use strict';

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

exports.handler = (event, context, callback) => {
    const message = JSON.parse(event.Records[0].Sns.Message)
    console.log('Received event:', JSON.stringify(message));
    var column

    switch (message.notificationType) {
        case "Delivery":
            column = "count_delivery"
            break;
            
        case "Bounce":
            column = "count_bounce"
            break;
            
        case "Complaint":
            column = "count_complaint"
            break;
            
        default:
            callback(null)
            return
    }

    dynamo.updateItem({
        TableName: process.env.DYNAMO_TABLE,
        Key: {
            'alias': message.mail.source
        },
        UpdateExpression: "add #counter :counter",
        ExpressionAttributeNames: {
            "#counter": column
        },
        ExpressionAttributeValues: {
            ":counter": 1
        }
    }, () => { callback(null) });
};



