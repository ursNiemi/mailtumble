'use strict';

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const alias = event.path.split('/').pop()

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : (res.Items.length > 0 ? '200' : '404'),
        body: err ? err.message : (res.Items.length > 0 ? JSON.stringify(res.Items[0]) : ''),
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
    });

    dynamo.query({
        TableName: event.stageVariables.DYNAMO_TABLE,
        KeyConditionExpression: "#alias = :alias",
        ExpressionAttributeNames: {
            "#alias": "alias"
        },
        ExpressionAttributeValues: {
            ":alias": alias
        }
    }, done);
};

